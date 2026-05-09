"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const goProxy = require("../src/checks/go-proxy");
const knownVulns = require("../src/checks/known-vulns");
const licenseCheck = require("../src/checks/license-check");
const maintainerActivity = require("../src/checks/maintainer-activity");
const newMaintainers = require("../src/checks/new-maintainers");
const postinstallScripts = require("../src/checks/postinstall-scripts");
const typosquatting = require("../src/checks/typosquatting");
const versionFreshness = require("../src/checks/version-freshness");
const { main } = require("../src/cli");
const { shellSplit, splitCommandSequence } = require("../src/cli/commands/fix");
const { commandForUpgrade } = require("../src/core/remediation");
const { scan } = require("../src/core/orchestrator");
const { readCache, writeCache } = require("../src/providers/cache");
const { parseArgs } = require("../src/utils/cli-args");
const { normalizeConfig } = require("../src/utils/config");
const { formatMarkdown, formatSarif, formatTable } = require("../src/utils/format");
const { readJson } = require("../src/utils/fs");
const { packageNameFromNodeModulesPath, resolveTransitiveCounts } = require("../src/parsers/common");
const { parseCargoManifest } = require("../src/parsers/rust");
const { parseGoMod, parseGoProject } = require("../src/parsers/go");
const { extractPythonVersionMarker, parsePipfileLock } = require("../src/parsers/python");
const { discoverProjectRoots } = require("../src/parsers/workspaces");

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dep-doctor-"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
}

test("scan detects offline npm advisories", async () => {
  const root = tempProject();
  writeJson(path.join(root, "package.json"), {
    name: "fixture",
    version: "1.0.0",
    dependencies: { lodash: "4.17.20" }
  });
  writeJson(path.join(root, "package-lock.json"), {
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { lodash: "4.17.20" } },
      "node_modules/lodash": {
        version: "4.17.20",
        license: "MIT",
        repository: { url: "https://github.com/lodash/lodash.git" }
      }
    }
  });

  const result = await scan(root, { skip: "license-check" });
  assert.equal(result.packages.length, 1);
  assert.equal(result.packages[0].dependency.name, "lodash");
  assert.equal(result.packages[0].issues.some((issue) => issue.id === "known-vulns" && issue.status === "fail"), true);
  assert.equal(result.summary.critical, 1);
});

test("baseline accepts existing issues and diff has no new findings", async () => {
  const root = tempProject();
  writeJson(path.join(root, "package.json"), {
    name: "fixture",
    version: "1.0.0",
    dependencies: { lodash: "4.17.20" }
  });
  writeJson(path.join(root, "package-lock.json"), {
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { lodash: "4.17.20" } },
      "node_modules/lodash": {
        version: "4.17.20",
        license: "MIT",
        repository: { url: "https://github.com/lodash/lodash.git" }
      }
    }
  });

  const first = await scan(root, { baseline: true, skip: "license-check" });
  assert.equal(fs.existsSync(path.join(root, ".dep-doctor-baseline.json")), true);
  assert.equal(first.summary.critical, 0);
  assert.equal(first.summary.acceptedIssues > 0, true);

  const second = await scan(root, { baseline: true, skip: "license-check" });
  assert.equal(second.packages[0].newIssues.length, 0);
  assert.equal(second.summary.critical, 0);
});

test("baseline fingerprints stay stable when issue message changes", async () => {
  const root = tempProject();
  writeJson(path.join(root, "package.json"), {
    name: "fixture",
    version: "1.0.0",
    dependencies: { fresh: "1.0.0" }
  });
  writeJson(path.join(root, "package-lock.json"), {
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { fresh: "1.0.0" } },
      "node_modules/fresh": { version: "1.0.0", license: "MIT" }
    }
  });
  writeJson(path.join(root, "node_modules", "fresh", "package.json"), {
    name: "fresh",
    version: "1.0.0",
    license: "MIT",
    _publishedAt: "2026-01-01T00:00:00.000Z"
  });

  await scan(root, {
    baseline: true,
    skip: "license-check,repo-mismatch",
    now: "2026-01-03T00:00:00.000Z"
  });
  const second = await scan(root, {
    baseline: true,
    skip: "license-check,repo-mismatch",
    now: "2026-01-04T00:00:00.000Z"
  });

  assert.equal(second.packages[0].issues.some((issue) => issue.id === "version-freshness" && issue.accepted), true);
  assert.equal(second.packages[0].newIssues.length, 0);
});

test("diff requires an existing baseline", async () => {
  const root = tempProject();
  writeJson(path.join(root, "package.json"), { name: "fixture", dependencies: { lodash: "4.17.20" } });
  writeJson(path.join(root, "package-lock.json"), {
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { lodash: "4.17.20" } },
      "node_modules/lodash": { version: "4.17.20", license: "MIT" }
    }
  });

  await assert.rejects(
    () => scan(root, { baseline: true, createBaseline: false, skip: "license-check" }),
    /Baseline not found/
  );
  assert.equal(fs.existsSync(path.join(root, ".dep-doctor-baseline.json")), false);
});

test("new maintainer with old account passes", () => {
  const result = newMaintainers.run({
    name: "fixture",
    maintainers: [{
      addedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2020-01-01T00:00:00.000Z"
    }]
  }, {
    now: new Date("2026-02-01T00:00:00.000Z")
  });

  assert.equal(result.status, "pass");
});

test("new maintainer without account age warns with degraded evidence", () => {
  const result = newMaintainers.run({
    name: "fixture",
    maintainers: [{
      addedAt: "2026-01-01T00:00:00.000Z"
    }]
  }, {
    now: new Date("2026-02-01T00:00:00.000Z")
  });

  assert.equal(result.status, "warn");
  assert.equal(result.details.degraded, true);
});

test("check boundaries match dependency health thresholds", () => {
  const context = {
    now: new Date("2026-01-01T00:00:00.000Z"),
    config: {
      thresholds: {
        "maintainer-activity": { warn: 180, fail: 365 },
        "version-freshness": { warn: 7, fail: 3 }
      }
    }
  };

  assert.equal(maintainerActivity.run({
    name: "fixture",
    lastMaintainerCommit: "2025-07-05T00:00:00.000Z"
  }, context).status, "warn");
  assert.equal(maintainerActivity.run({
    name: "fixture",
    metadataModifiedAt: "2025-12-31T00:00:00.000Z"
  }, context).details.degraded, true);
  assert.equal(versionFreshness.run({
    name: "fixture",
    version: "1.0.0",
    publishedAt: "2025-12-28T00:00:00.000Z"
  }, context).status, "warn");
  assert.equal(newMaintainers.run({
    name: "fixture",
    maintainers: [{
      addedAt: "2025-12-15T00:00:00.000Z",
      createdAt: "2025-10-03T00:00:00.000Z"
    }]
  }, context).status, "warn");
});

test("known vulnerability pass result marks offline DB as degraded", () => {
  const result = knownVulns.run({
    ecosystem: "npm",
    name: "not-in-offline-db",
    version: "1.0.0"
  });

  assert.equal(result.status, "pass");
  assert.equal(result.details.degraded, true);
});

test("event-stream advisory covers spec example and rollback remediation", () => {
  const result = knownVulns.run({
    ecosystem: "npm",
    name: "event-stream",
    version: "4.0.1"
  });
  assert.equal(result.status, "fail");
  assert.equal(result.details.advisories[0].type, "rollback");
  assert.equal(commandForUpgrade({ ecosystem: "go", name: "golang.org/x/crypto" }, "v0.17.0"), "go get golang.org/x/crypto@v0.17.0");
});

test("go-proxy degrades when per-package source is unavailable", () => {
  const previous = process.env.GOPROXY;
  process.env.GOPROXY = "https://private.example.invalid";
  try {
    const result = goProxy.run({ name: "example.com/module" });
    assert.equal(result.status, "pass");
    assert.equal(result.details.degraded, true);
  } finally {
    if (previous === undefined) delete process.env.GOPROXY;
    else process.env.GOPROXY = previous;
  }
});

test("local risk checks avoid false positives where evidence is missing", () => {
  assert.equal(typosquatting.run({
    name: "expres",
    version: "1.0.0"
  }).status, "warn");
  assert.equal(postinstallScripts.run({
    name: "fixture",
    version: "1.4.0",
    scripts: { postinstall: "node ./setup.js" },
    installScriptAgeMinorVersions: 4
  }).status, "warn");
  assert.equal(postinstallScripts.run({
    name: "fixture",
    version: "1.1.0",
    scripts: { postinstall: "node ./setup.js" },
    installScriptAgeMinorVersions: 1
  }).status, "warn");
  assert.equal(postinstallScripts.run({
    name: "fixture",
    version: "1.0.0",
    scripts: { postinstall: "node ./setup.js" },
    installScriptAgeMinorVersions: 0
  }).status, "fail");
  assert.equal(licenseCheck.run({
    name: "fixture",
    license: "MIT AND GPL-3.0"
  }).status, "warn");
  assert.equal(licenseCheck.run({
    name: "fixture",
    license: "Apache 2.0"
  }).status, "pass");
});

test("workspace discovery parses multiline Cargo and Poetry members without recursive scan", () => {
  const root = tempProject();
  writeText(path.join(root, "Cargo.toml"), `[workspace]
members = [
  "crates/a",
  "crates/b",
]
`);
  writeText(path.join(root, "pyproject.toml"), `[tool.poetry.workspace]
members = [
  "packages/api",
]
`);
  writeText(path.join(root, "crates", "a", "Cargo.toml"), "[package]\nname = \"a\"\nversion = \"0.1.0\"\n");
  writeText(path.join(root, "crates", "b", "Cargo.toml"), "[package]\nname = \"b\"\nversion = \"0.1.0\"\n");
  writeText(path.join(root, "packages", "api", "pyproject.toml"), "[tool.poetry]\nname = \"api\"\nversion = \"0.1.0\"\n");
  writeText(path.join(root, "examples", "ignored", "package.json"), "{\"name\":\"ignored\"}\n");

  assert.deepEqual(parseCargoManifest(root).members, ["crates/a", "crates/b"]);
  const relativeRoots = discoverProjectRoots(root, true).map((entry) => path.relative(root, entry)).sort();
  assert.deepEqual(relativeRoots, ["", "crates/a", "crates/b", "packages/api"]);
});

test("Go parser captures replace directives and local module source", () => {
  const root = tempProject();
  writeText(path.join(root, "go.mod"), `module example.com/app

go 1.22

require (
  example.com/lib v1.2.3
  github.com/gin-gonic/gin v1.8.0
)

replace example.com/lib => ../lib
replace github.com/gin-gonic/gin => github.com/company/gin v1.8.1
`);

  const mod = parseGoMod(root);
  assert.equal(mod.replacements.get("example.com/lib").local, true);
  assert.equal(mod.replacements.get("github.com/gin-gonic/gin").target, "github.com/company/gin");

  const parsed = parseGoProject(root);
  const lib = parsed.dependencies.find((dep) => dep.name === "example.com/lib");
  const gin = parsed.dependencies.find((dep) => dep.name === "github.com/gin-gonic/gin");
  assert.equal(lib.source, "local:../lib");
  assert.match(gin.source, /github\.com\/company\/gin/);
});

test("CLI parser handles short flag values and fix command sequences", () => {
  const parsed = parseArgs(["check", "lodash@4.17.21", "-e", "npm", "-vh"]);
  assert.equal(parsed.flags.e, "npm");
  assert.equal(parsed.flags.v, true);
  assert.equal(parsed.flags.h, true);
  assert.deepEqual(require("../src/utils/cli-args").csv("true"), []);
  assert.deepEqual(shellSplit("python -m pip install 'django==3.2.25'"), ["python", "-m", "pip", "install", "django==3.2.25"]);
  assert.deepEqual(splitCommandSequence("npm install dayjs && npm uninstall moment"), ["npm install dayjs", "npm uninstall moment"]);
});

test("config validation rejects invalid values", () => {
  assert.throws(() => normalizeConfig({ "fail-on": "sometimes" }), /fail-on/);
  assert.throws(() => normalizeConfig({ format: "xml" }), /format/);
  assert.throws(() => normalizeConfig({ thresholds: { "version-freshness": { warn: -1 } } }), /thresholds/);
  assert.throws(() => normalizeConfig({ plugins: ["dep-doctor-plugin-example"] }), /plugins/);
});

test("package path normalization and transitive count handle edge cases", () => {
  assert.equal(packageNameFromNodeModulesPath("node_modules/@scope/pkg@1.2.3"), "@scope/pkg");
  assert.equal(packageNameFromNodeModulesPath("node_modules/pkg@1.2.3"), "pkg");
  const deps = resolveTransitiveCounts([
    { name: "a", key: "npm:a@1.0.0", dependencyNames: ["b"] },
    { name: "b", key: "npm:b@1.0.0", dependencyNames: ["c"] },
    { name: "c", key: "npm:c@1.0.0", dependencyNames: ["a"] }
  ]);
  assert.equal(deps.find((dep) => dep.name === "a").transitiveCount, 2);
});

test("JSON cache honors TTL metadata", () => {
  const previous = process.env.DEP_DOCTOR_CACHE;
  const root = tempProject();
  process.env.DEP_DOCTOR_CACHE = root;
  try {
    writeCache("osv-test", { ok: true });
    assert.deepEqual(readCache("osv-test", { ttlMs: 1000 }), { ok: true });
    const file = path.join(root, "osv-test.json");
    const payload = JSON.parse(fs.readFileSync(file, "utf8"));
    payload.__meta.updatedAt = "2000-01-01T00:00:00.000Z";
    fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    assert.deepEqual(readCache("osv-test", { ttlMs: 1000 }), {});
  } finally {
    if (previous === undefined) delete process.env.DEP_DOCTOR_CACHE;
    else process.env.DEP_DOCTOR_CACHE = previous;
  }
});

test("Pipfile markers are normalized to python version ranges", () => {
  assert.equal(
    extractPythonVersionMarker('python_version >= "3.8" and python_version < "4.0"'),
    ">=3.8 <4.0"
  );

  const root = tempProject();
  const pipfile = path.join(root, "Pipfile.lock");
  writeJson(pipfile, {
    _meta: { requires: { python_version: "3.11" } },
    default: {
      django: {
        version: "==3.2.0",
        markers: 'python_version >= "3.8" and python_version < "4.0"'
      }
    },
    develop: {}
  });

  const deps = parsePipfileLock(root, pipfile);
  assert.equal(deps[0].requiresPython, ">=3.8 <4.0");
  assert.equal(extractPythonVersionMarker('python_version >= "3.8" or python_version == "3.7"'), null);
});

test("readJson includes line and column for corrupted JSON", () => {
  const root = tempProject();
  const file = path.join(root, "package-lock.json");
  writeText(file, "{\n  \"bad\": \n}\n");
  assert.throws(() => readJson(file), /package-lock\.json:3:1/);
});

test("markdown report includes details blocks", async () => {
  const root = tempProject();
  writeJson(path.join(root, "package.json"), { name: "fixture", dependencies: { lodash: "4.17.20" } });
  writeJson(path.join(root, "package-lock.json"), {
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { lodash: "4.17.20" } },
      "node_modules/lodash": { version: "4.17.20", license: "MIT" }
    }
  });
  const result = await scan(root, { skip: "license-check" });
  const markdown = formatMarkdown(result);
  assert.match(markdown, /<details>/);
  assert.match(markdown, /\*\*known-vulns:\*\*/);
});

test("markdown and sarif include accepted and severity metadata", async () => {
  const root = tempProject();
  writeJson(path.join(root, "package.json"), { name: "fixture", dependencies: { lodash: "4.17.20" } });
  writeJson(path.join(root, "package-lock.json"), {
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { lodash: "4.17.20" } },
      "node_modules/lodash": { version: "4.17.20", license: "MIT" }
    }
  });
  const result = await scan(root, { baseline: true, skip: "license-check" });
  const markdown = formatMarkdown(result);
  assert.match(markdown, /accepted in baseline/);

  const sarif = JSON.parse(formatSarif(result));
  assert.equal(sarif.runs[0].results[0].properties.severity, "HIGH");
  assert.equal(sarif.runs[0].tool.driver.rules[0].properties.severity, "HIGH");
  const previous = process.env.DEP_DOCTOR_HELP_URI;
  process.env.DEP_DOCTOR_HELP_URI = "https://example.invalid/help";
  try {
    const customSarif = JSON.parse(formatSarif(result));
    assert.equal(customSarif.runs[0].tool.driver.rules[0].helpUri, "https://example.invalid/help");
  } finally {
    if (previous === undefined) delete process.env.DEP_DOCTOR_HELP_URI;
    else process.env.DEP_DOCTOR_HELP_URI = previous;
  }
});

test("table output includes diff header and duration", async () => {
  const root = tempProject();
  writeJson(path.join(root, "package.json"), { name: "fixture", dependencies: { lodash: "4.17.20" } });
  writeJson(path.join(root, "package-lock.json"), {
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { lodash: "4.17.20" } },
      "node_modules/lodash": { version: "4.17.20", license: "MIT" }
    }
  });
  const result = await scan(root, { baseline: true, skip: "license-check" });
  const table = formatTable(result, { diffOnly: true, color: false });
  assert.match(table, /diffing baseline for/);
  assert.match(table, /in \d+ms/);
  assert.match(formatTable(result, { color: false }), /─{10,}\nSummary:/);
  assert.match(formatTable(await scan(root, { skip: "license-check" }), { color: false }), /💡 Run `dep-doctor fix` to interactively resolve critical issues/);
  assert.match(formatTable(result, { color: false }), /📉 lodash\s+4\.17\.20\s+83\s+Healthy|📉 lodash\s+4\.17\.20\s+83\s+Warning/);
});

test("CLI check emits JSON", async () => {
  let stdout = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    stdout += chunk;
    return true;
  };
  try {
    const code = await main([
    "check",
    "lodash@4.17.20",
    "--format=json",
    "--skip=license-check",
    "--fail-on=none"
    ]);
    assert.equal(code, 0);
  } finally {
    process.stdout.write = originalWrite;
  }
  const output = JSON.parse(stdout);
  assert.equal(output.packages[0].package, "lodash");
  assert.equal(output.packages[0].issues.some((issue) => issue.id === "known-vulns"), true);
});
