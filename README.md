# dep-doctor

Your dependencies need a checkup.

`dep-doctor` is an offline-first CLI and GitHub Action for dependency health checks across npm, Python,
Rust, and Go. It scans lock files for known advisories, risky install scripts, typosquatting signals,
stale or suspicious packages, repository mismatches, license issues, large transitive dependency trees,
and ecosystem compatibility problems.

It is built for fast CI feedback:

- no account required;
- no cloud upload required;
- no telemetry;
- no network access required by default;
- baseline-aware reports, so old accepted risks do not keep breaking builds.

## Demo Output

```bash
npx dep-doctor scan .
```

```text
🩺 dep-doctor v1.0.0 — scanning 1 dependencies in 2ms...

  Package                      Version      Score  Status    Issues
  ──────────────────────────────────────────────────────────────────────────────────────
  🚨 lodash                    4.17.20      83     Critical  GHSA-35jh-r3h4-6jhm (HIGH)
  ──────────────────────────────────────────────────────────────────────────────────────
Summary: 0 healthy · 0 warning · 1 critical
Project status: 🚨 CRITICAL

💡 Run `dep-doctor fix` to interactively resolve critical issues.
📖 Run `dep-doctor diff --baseline` to see only new issues.
```

## Why dep-doctor?

`npm audit` is useful for CVEs, but dependency risk is broader than CVEs. `dep-doctor` focuses on the
signals that often matter in supply-chain incidents: suspicious package names, risky install scripts,
repository provenance, abandoned maintainers, newly published versions, license policy, and baseline drift.

| Capability | npm audit | Snyk | Socket | dep-doctor |
| --- | --- | --- | --- | --- |
| Known vulnerability checks | Yes | Yes | Yes | Yes |
| Runs without an account | Yes | Limited | Limited | Yes |
| Offline-first CI mode | Limited | No | No | Yes |
| No telemetry by default | Yes | No | No | Yes |
| Lock-file based scanning | Yes | Yes | Yes | Yes |
| Baseline-aware CI reports | No | Yes | Yes | Yes |
| Risky install script signal | No | Limited | Yes | Yes |
| Typosquatting signal | No | Limited | Yes | Yes |
| Multi-ecosystem lock files | No | Yes | Limited | Yes |

`dep-doctor` is not a replacement for every cloud security platform. It is a local-first dependency health
gate that is easy to run in developer machines, private CI, and open-source pull requests.

## Quick Start

```bash
npx dep-doctor scan .
npx dep-doctor scan --baseline
npx dep-doctor diff --baseline
npx dep-doctor check lodash@4.17.21
npx dep-doctor init
```

Output formats:

```bash
npx dep-doctor scan --format=table
npx dep-doctor scan --format=json --output=report.json
npx dep-doctor scan --format=markdown --output=report.md
npx dep-doctor scan --format=sarif --output=dep-doctor.sarif
```

## GitHub Action

Copy this workflow into `.github/workflows/dep-doctor.yml`:

```yaml
name: Dependency Health

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  dep-doctor:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: balyakin/dep-doctor@v1
        with:
          baseline: true
          fail-on: critical
          format: sarif
          upload-sarif: true
      - uses: github/codeql-action/upload-sarif@v4
        if: always() && hashFiles('dep-doctor.sarif') != ''
        with:
          sarif_file: dep-doctor.sarif
```

For pull request comments:

```yaml
- uses: balyakin/dep-doctor@v1
  with:
    baseline: true
    comment-on-pr: true
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Supported Inputs

- npm: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `package.json`
- Python: `poetry.lock`, `Pipfile.lock`, `requirements.txt`, `pyproject.toml`
- Rust: `Cargo.lock`, `Cargo.toml`
- Go: `go.sum`, `go.mod`

Workspaces are discovered automatically for npm, pnpm, Poetry, Cargo, and Go workspaces.

## Checks

- `known-vulns`: known advisories from the offline advisory database
- `postinstall-scripts`: install scripts that execute code during dependency installation
- `typosquatting`: names similar to popular packages
- `repo-mismatch`: package repository and publish-source mismatch signals
- `maintainer-activity`: stale maintainer activity where local evidence is available
- `new-maintainers`: suspicious maintainer changes where local evidence is available
- `version-freshness`: very fresh releases and pre-release packages
- `dep-count`: large transitive dependency trees
- `license-check`: permissive, copyleft, unknown, and missing license signals
- `pip-audit`, `crates-vulns`, `govulncheck`: ecosystem-specific advisory checks
- `python-env-mismatch`, `msrv-check`, `go-proxy`: ecosystem compatibility and source checks

When registry or repository metadata is unavailable locally, checks degrade conservatively and explain the
missing evidence instead of inventing certainty.

## Baseline Mode

Baseline mode keeps CI focused on new risk:

```bash
npx dep-doctor scan --baseline
npx dep-doctor diff --baseline
```

The first baseline run creates `.dep-doctor-baseline.json`. Future scans mark already-known issues as
accepted and fail only on new warnings or critical findings according to `--fail-on`.

## Configuration

Create a config file:

```bash
npx dep-doctor init
```

Example `.dep-doctor.yml`:

```yaml
format: table
fail-on: critical
workspaces: auto

skip:
  - license-check

ignore:
  - "@company/*"

baseline:
  path: .dep-doctor-baseline.json
  auto-update: false
```

## Privacy

`dep-doctor` is designed to run locally by default. The scanner does not require dependency uploads,
accounts, API keys, or background telemetry. GitHub API access is only used when you explicitly enable
pull request comments in the GitHub Action.
