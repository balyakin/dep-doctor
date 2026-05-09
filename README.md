# dep-doctor

Your dependencies need a checkup.

`dep-doctor` is an offline-first CLI and GitHub Action that scans dependency lock files for dependency-health risks: known advisories, risky install scripts, typosquatting, stale packages, repository mismatches, license problems, excessive transitive dependencies, and ecosystem-specific compatibility issues.

## Usage

```bash
npx dep-doctor scan .
dep-doctor scan --baseline
dep-doctor scan --format=json --output=report.json
dep-doctor check lodash@4.17.21
dep-doctor init
```

Supported inputs:

- npm: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `package.json`
- Python: `poetry.lock`, `Pipfile.lock`, `requirements.txt`, `pyproject.toml`
- Rust: `Cargo.lock`, `Cargo.toml`
- Go: `go.sum`, `go.mod`

The scanner does not require network access. When registry or repository metadata is unavailable locally, checks degrade conservatively and explain the missing evidence.
