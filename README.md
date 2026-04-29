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
- **Authenticated registries.** Public GitHub only.

## Default registry

`github:orpendev/agent-skills` is hardcoded as the default and is the registry curated by the Orpen team. Anyone can run their own audited skill registry following the same layout (`skills/<name>/SKILL.md` + `manifest.json` + tags shaped `skills/<name>/<version>`) and point this CLI at it via `--registry` or `ORPEN_SKILL_REGISTRY`.

## License

MIT.
