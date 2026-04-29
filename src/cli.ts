#!/usr/bin/env node
import { Command } from "commander";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, mkdtemp, readdir, readFile, rm, cp, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import * as tar from "tar";

const VERSION = "0.0.1";
const DEFAULT_REGISTRY = "github:orpendev/agent-skills";

// ── helpers ──────────────────────────────────────────────────────────

interface RegistryRef {
  owner: string;
  repo: string;
}

function parseRegistry(spec: string): RegistryRef {
  const m = spec.match(/^github:([^/]+)\/(.+)$/);
  if (!m) {
    throw new Error(
      `Invalid registry spec: "${spec}". Expected "github:owner/repo".`,
    );
  }
  return { owner: m[1], repo: m[2] };
}

function parseSkillSpec(spec: string): { name: string; version: string } {
  const at = spec.lastIndexOf("@");
  if (at <= 0) return { name: spec, version: "latest" };
  return { name: spec.slice(0, at), version: spec.slice(at + 1) };
}

/** Compares two semver strings. Returns negative if a<b, 0 if equal, positive if a>b. */
function semverCompare(a: string, b: string): number {
  const parts = (s: string) => s.split(/[.-]/).map((p) => (/^\d+$/.test(p) ? parseInt(p, 10) : p));
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x).localeCompare(String(y));
  }
  return 0;
}

function installRoot(target: string): string {
  switch (target) {
    case "claude-code":
      return join(homedir(), ".claude", "skills");
    case "codex":
      return join(homedir(), ".codex", "skills");
    default:
      throw new Error(
        `Unsupported target: "${target}". Supported targets: claude-code, codex.`,
      );
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// ── registry ──────────────────────────────────────────────────────────

const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": `orpen-skill-cli/${VERSION}`,
  "X-GitHub-Api-Version": "2022-11-28",
};

async function fetchTagsForSkill(ref: RegistryRef, skillName: string): Promise<string[]> {
  // GitHub paginates at 100/page. For the registry's expected size (< few hundred
  // releases), one page is enough. Revisit if/when this stops being true.
  const url = `https://api.github.com/repos/${ref.owner}/${ref.repo}/tags?per_page=100`;
  const res = await fetch(url, { headers: GH_HEADERS });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch tags from ${ref.owner}/${ref.repo}: ${res.status} ${res.statusText}`,
    );
  }
  const tags = (await res.json()) as Array<{ name: string }>;
  const prefix = `skills/${skillName}/`;
  return tags.map((t) => t.name).filter((n) => n.startsWith(prefix));
}

async function resolveTag(
  ref: RegistryRef,
  name: string,
  version: string,
): Promise<string> {
  const tags = await fetchTagsForSkill(ref, name);
  if (tags.length === 0) {
    throw new Error(`No releases found for skill "${name}" on ${ref.owner}/${ref.repo}.`);
  }
  if (version === "latest") {
    const sorted = [...tags].sort((a, b) =>
      semverCompare(a.split("/").pop()!, b.split("/").pop()!),
    );
    return sorted[sorted.length - 1];
  }
  const exact = `skills/${name}/${version}`;
  if (tags.includes(exact)) return exact;
  const versions = tags.map((t) => t.split("/").pop()).join(", ");
  throw new Error(
    `Version "${version}" not found for "${name}". Available: ${versions}`,
  );
}

async function downloadTarball(
  ref: RegistryRef,
  tag: string,
  destFile: string,
): Promise<void> {
  // Note: GitHub's tarball endpoint redirects to a codeload URL. fetch() follows
  // the redirect by default but the second request shouldn't carry the Accept
  // header; we keep User-Agent for friendliness.
  const url = `https://api.github.com/repos/${ref.owner}/${ref.repo}/tarball/refs/tags/${encodeURIComponent(tag)}`;
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": GH_HEADERS["User-Agent"] },
  });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download tarball: ${res.status} ${res.statusText}`);
  }
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(destFile));
}

// ── commands ──────────────────────────────────────────────────────────

interface InstallOpts {
  registry?: string;
  target: string;
  force?: boolean;
}

async function install(spec: string, opts: InstallOpts): Promise<void> {
  const { name, version } = parseSkillSpec(spec);
  const registrySpec =
    opts.registry ?? process.env.ORPEN_SKILL_REGISTRY ?? DEFAULT_REGISTRY;
  const ref = parseRegistry(registrySpec);
  const root = installRoot(opts.target);
  const dest = join(root, name);

  if ((await pathExists(dest)) && !opts.force) {
    throw new Error(
      `${dest} already exists. Use --force to overwrite, or remove it first.`,
    );
  }

  process.stderr.write(`→ resolving ${name}@${version} on ${ref.owner}/${ref.repo}\n`);
  const tag = await resolveTag(ref, name, version);
  process.stderr.write(`→ tag: ${tag}\n`);

  const tmp = await mkdtemp(join(tmpdir(), "orpen-skill-"));
  try {
    const tarballPath = join(tmp, "skill.tar.gz");
    process.stderr.write(`→ downloading\n`);
    await downloadTarball(ref, tag, tarballPath);

    process.stderr.write(`→ extracting\n`);
    await tar.extract({ file: tarballPath, cwd: tmp });

    // GitHub tarballs have a single top-level directory: <repo>-<sha>/
    const entries = (await readdir(tmp, { withFileTypes: true })).filter(
      (e) => e.isDirectory(),
    );
    if (entries.length === 0) throw new Error("Empty tarball.");
    const skillSrc = join(tmp, entries[0].name, "skills", name);
    if (!(await pathExists(skillSrc))) {
      throw new Error(
        `Skill "${name}" not found in tarball at expected path (skills/${name}/).`,
      );
    }

    if (await pathExists(dest)) {
      await rm(dest, { recursive: true, force: true });
    }
    await mkdir(dest, { recursive: true });
    await cp(skillSrc, dest, { recursive: true });

    let displayVersion = version;
    try {
      const m = JSON.parse(
        await readFile(join(dest, "manifest.json"), "utf8"),
      ) as { version?: string };
      if (m.version) displayVersion = m.version;
    } catch {
      // manifest absent or malformed — fall back to spec version
    }

    process.stdout.write(`✓ installed ${name}@${displayVersion} → ${dest}\n`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

interface ListOpts {
  target: string;
}

async function list(opts: ListOpts): Promise<void> {
  const root = installRoot(opts.target);
  if (!(await pathExists(root))) {
    process.stdout.write(`(no skills installed at ${root})\n`);
    return;
  }
  const entries = (await readdir(root, { withFileTypes: true })).filter(
    (e) => e.isDirectory(),
  );
  if (entries.length === 0) {
    process.stdout.write(`(no skills installed at ${root})\n`);
    return;
  }
  for (const e of entries) {
    let line = e.name;
    try {
      const m = JSON.parse(
        await readFile(join(root, e.name, "manifest.json"), "utf8"),
      ) as { version?: string };
      if (m.version) line += `@${m.version}`;
    } catch {
      // no manifest — list bare folder name
    }
    process.stdout.write(`${line}\n`);
  }
}

// ── entry ─────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("orpen-skill-cli")
  .description(
    "Install audited skills from the Orpen registry into local AI coding agents.",
  )
  .version(VERSION);

program
  .command("install <spec>")
  .description(
    "Install a skill (e.g. 'mcp-bootstrap' or 'sql-auditor@0.1.0'). Defaults to latest.",
  )
  .option(
    "--registry <url>",
    `Registry override (github:owner/repo). Default: ${DEFAULT_REGISTRY}`,
  )
  .option("--target <tool>", "Target tool: claude-code or codex", "claude-code")
  .option("-f, --force", "Overwrite existing install")
  .action(async (spec: string, opts: InstallOpts) => {
    try {
      await install(spec, opts);
    } catch (e) {
      process.stderr.write(`✖ ${(e as Error).message}\n`);
      process.exit(1);
    }
  });

program
  .command("list")
  .description("List installed skills.")
  .option("--target <tool>", "Target tool: claude-code or codex", "claude-code")
  .action(async (opts: ListOpts) => {
    try {
      await list(opts);
    } catch (e) {
      process.stderr.write(`✖ ${(e as Error).message}\n`);
      process.exit(1);
    }
  });

program.parseAsync().catch((e) => {
  process.stderr.write(`✖ ${(e as Error).message}\n`);
  process.exit(1);
});
