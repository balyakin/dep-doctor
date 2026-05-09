"use strict";

const path = require("path");
const { runChecks } = require("../../checks");
const { scorePackage, summarize } = require("../../core/scoring");
const { csv, parseArgs } = require("../../utils/cli-args");
const { loadConfig } = require("../../utils/config");
const { formatScan } = require("../../utils/format");
const { makeDependency, readNodePackageMetadata } = require("../../parsers/common");
const { shouldFail } = require("../../core/orchestrator");

function parsePackageSpec(spec) {
  const value = String(spec || "");
  const at = value.startsWith("@") ? value.lastIndexOf("@") : value.indexOf("@");
  if (at > 0) return { name: value.slice(0, at), version: value.slice(at + 1) || "unknown" };
  return { name: value, version: "unknown" };
}

async function run(argv) {
  const { args, flags } = parseArgs(argv);
  if (!args[0]) throw new Error("Usage: dep-doctor check <package@version>");
  const root = process.cwd();
  const { config } = loadConfig(root, flags.config);
  const parsed = parsePackageSpec(args[0]);
  const ecosystem = flags.ecosystem || flags.e || "npm";
  const localMetadata = ecosystem === "npm" ? readNodePackageMetadata(root, parsed.name) : {};
  const dependencyNames = flags.deps
    ? String(flags.deps).split(",").map((name) => name.trim()).filter(Boolean)
    : (localMetadata.dependencyNames || []);
  const dep = makeDependency({
    ecosystem: ecosystem === "rust" ? "cargo" : ecosystem,
    manager: ecosystem,
    name: parsed.name,
    version: parsed.version,
    direct: true,
    dependencyNames,
    projectRoot: root,
    license: localMetadata.license,
    repository: localMetadata.repository,
    publishRepository: localMetadata.publishRepository,
    scripts: localMetadata.scripts,
    hasInstallScript: Boolean(localMetadata.scripts && (localMetadata.scripts.preinstall || localMetadata.scripts.install || localMetadata.scripts.postinstall)),
    maintainers: localMetadata.maintainers,
    publishedAt: localMetadata.publishedAt,
    metadataSource: localMetadata.metadataSource,
    metadataModifiedAt: localMetadata.metadataModifiedAt
  });
  const checks = runChecks(dep, {
    now: new Date(),
    config,
    skip: csv(flags.skip),
    root
  });
  const result = scorePackage(dep, checks);
  const scan = {
    root,
    config,
    lockFiles: [],
    manifests: [],
    packages: [result],
    summary: summarize([result]),
    baseline: { enabled: false }
  };
  process.stdout.write(formatScan(scan, { format: flags.format || config.format || "table" }));
  if (flags.verbose) {
    for (const check of checks) process.stdout.write(`- ${check.id}: ${check.status} - ${check.message}\n`);
  }
  return shouldFail(scan, flags["fail-on"] || config.failOn || "critical") ? 1 : 0;
}

module.exports = { parsePackageSpec, run };
