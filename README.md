# orpen-skill-cli

CLI for installing audited skills/agents from an Orpen-style registry into local AI coding agents (Claude Code, Codex).

This tool is a thin fetcher: it resolves a tag, downloads the matching tarball from the registry's GitHub repository, and copies the skill folder to the right place on disk. The audit happens in the registry, not here — this CLI doesn't decide what's safe to install.

## Install

```bash
npm install -g orpen-skill-cli
```

## Usage

```bash
# install latest version of a skill
orpen-skill-cli install mcp-bootstrap

# pin a version
orpen-skill-cli install sql-auditor@0.1.0

# install for codex instead of claude-code
orpen-skill-cli install mcp-bootstrap --target codex

# overwrite an existing install
orpen-skill-cli install mcp-bootstrap --force

# list installed skills
orpen-skill-cli list

# list codex-targeted installs
orpen-skill-cli list --target codex
```

The default registry is `github:orpendev/agent-skills`. Override per-call with `--registry github:owner/repo` or globally via the `ORPEN_SKILL_REGISTRY` environment variable.

### Private registries / rate limits

The CLI talks to the GitHub API anonymously by default, which works for any public registry. To install from a private registry (or to avoid anonymous rate limits), set a token with read access to the repo — checked in this order: `ORPEN_SKILL_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`. Note: GitHub answers 404 (not 403) for private repos the caller can't see, so a "repository not found" error against a registry you know exists usually means a missing or wrong token.

## Available skills

The Orpen registry currently publishes six audited skills. All are stack-agnostic unless noted, and all support `claude-code` plus the targets listed.

| Name                                          | Targets                              | Purpose                                                                                                            |
| --------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [`mcp-bootstrap`](#mcp-bootstrap)             | `claude-code`                        | Scaffold a new MCP server repo (TypeScript + Express + zod) that boots out-of-the-box.                             |
| [`sql-auditor`](#sql-auditor)                 | `claude-code`, `codex`               | Audit raw SQL in TypeScript diffs against schema-prefix / bind-variable / interpolation / DB-service conventions.  |
| [`coupling-analysis`](#coupling-analysis)     | `claude-code`, `cursor`, `windsurf`  | Three-dimensional coupling review (strength × distance × volatility) from Khononov's *Balancing Coupling*.         |
| [`domain-analysis`](#domain-analysis)         | `claude-code`, `cursor`, `windsurf`  | DDD strategic design — identify subdomains (Core / Supporting / Generic) and propose bounded contexts.             |
| [`franco`](#franco)                           | all six runtimes                     | Calibrated adversarial-honesty posture for evaluating one concrete artifact (pt-BR).                               |
| [`graphify`](#graphify)                       | `claude-code`                        | Build a persistent, queryable knowledge graph from any folder (code, docs, papers, images, videos).                |

Install any of them with `orpen-skill-cli install <name>`. Pin a version with `<name>@<version>`. Audit reports for each release live at `audits/skills/<name>/<version>.md` in the registry repo.

### `mcp-bootstrap`

Generates a complete TypeScript MCP server: structured logger, AsyncLocalStorage per-request context, generic typed HTTP client (timeout + sensitive-field redaction), `mcpTool()` wrapper that drops try/catch boilerplate, plus one sample domain hitting JSONPlaceholder so the new project boots and works without any wiring. The auth scheme stays as a placeholder for the user to plug in, with four commented examples (Basic, Bearer, API key, static env key).

```bash
orpen-skill-cli install mcp-bootstrap
```

### `sql-auditor`

Reviews raw SQL in TypeScript diffs against four conventions: schema prefix (every table prefixed with the project's canonical schema reference), bind variable hygiene (no positional reuse — critical on Oracle), string interpolation safety (only the canonical schema reference inside template literals), and DB-service availability (no hardcoded schema strings). Targets NestJS/TypeORM-style projects with multi-schema databases (Oracle, Postgres). Output is grouped by file with `FAIL` / `NIT` severities and a final `PASS` / `PASS_WITH_NITS` / `FAIL` verdict.

```bash
orpen-skill-cli install sql-auditor
```

### `coupling-analysis`

Six-phase coupling review based on the three-dimensional model from Vlad Khononov's *Balancing Coupling in Software Design*: context gathering → structural mapping (dependency graph + distance via encapsulation hierarchy) → integration-strength classification (Intrusive / Functional / Model / Contract) → volatility assessment (subdomain type + git history) → balance score (`STRENGTH × DISTANCE × VOLATILITY`) → structured report (executive summary, dependency map, issues by severity, prioritized recommendations). Stack-agnostic.

The classification matters: tightly coupled components should live close together (high cohesion), distant components should be loosely coupled, and stable components can tolerate stronger coupling. The balance formula `BALANCE = (STRENGTH XOR DISTANCE) OR NOT VOLATILITY` is the heuristic the skill applies systematically.

```bash
orpen-skill-cli install coupling-analysis
```

### `domain-analysis`

Three-phase DDD strategic-design playbook: extract domain concepts (entities, services, use cases, controllers — filtering out infrastructure) → group by ubiquitous language (linguistic boundaries, where term meanings shift = different bounded context) → classify subdomains via decision tree (Core: competitive advantage / Supporting: business-specific support / Generic: standard functionality). Output is a strategic map: extracted concepts, groupings, classified subdomains, and proposed context boundaries.

Companion files live in `references/` after install (`EXAMPLES.md` with four worked-out domains — e-commerce, healthcare, SaaS project management, streaming video — and `QUICK-REFERENCE.md` with decision trees and integration patterns).

```bash
orpen-skill-cli install domain-analysis
```

### `franco`

Calibrated adversarial-honesty posture skill (written in pt-BR): full-response evaluation protocol for one concrete artifact — decision, code, plan, text, claim, or architecture. Verdict first, every load-bearing claim labeled `[fato]`/`[inferência]`/`[chute]`, failures ranked by severity, genuine merits stated flat, steelman when stakes are high, explicit uncertainty. Also confronts the premise of the request itself when it is wrong or self-contradictory. Pure prose — no commands, no filesystem, no network.

```bash
orpen-skill-cli install franco
```

### `graphify`

Turns any folder (code, docs, papers, images, videos) into a persistent knowledge graph with community detection, god nodes, and an EXTRACTED/INFERRED/AMBIGUOUS audit trail; `query`/`path`/`explain` flows then answer codebase questions from the graph instead of re-reading files. Third-party content vendored from the MIT-licensed PyPI package `graphifyy` (the registry copy pins the package install to the audited version — see the audit report). `claude-code` only: the skill depends on Claude Code's subagent dispatch semantics.

```bash
orpen-skill-cli install graphify
```

## Where things land

| Target        | Install path                            |
| ------------- | --------------------------------------- |
| `claude-code` | `~/.claude/skills/<name>/`              |
| `codex`       | `~/.codex/skills/<name>/`               |

## Versioning

Tags in the registry follow the pattern `skills/<name>/<version>` (e.g. `skills/mcp-bootstrap/0.1.0`). The CLI resolves `latest` to the highest semver across that tag prefix.

## What this CLI does NOT do (yet)

- **Hash verification against the audit report.** Planned for v0.1.0.
- **Per-tool format projection.** Skills currently install verbatim. When skills publish multi-tool content, the projection layer goes here.
- **Update / uninstall.** Reinstall with `--force` for now; remove the directory manually for uninstall.

## Default registry

`github:orpendev/agent-skills` is hardcoded as the default and is the registry curated by the Orpen team. **It is a private repository** — installing from it requires a token with read access (see [Private registries](#private-registries--rate-limits) above); without one, the CLI reports it as not found. Anyone can run their own audited skill registry following the same layout (`skills/<name>/SKILL.md` + `manifest.json` + tags shaped `skills/<name>/<version>`) and point this CLI at it via `--registry` or `ORPEN_SKILL_REGISTRY`.

## License

MIT.
