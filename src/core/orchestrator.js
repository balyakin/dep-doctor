"use strict";

const path = require("path");
const { runChecks } = require("../checks");
const { parseProject } = require("../parsers");
const { loadConfig } = require("../utils/config");
const { csv } = require("../utils/cli-args");
const { scorePackage, summarize } = require("./scoring");
const { applyBaseline, baselinePath, loadBaseline, writeBaseline } = require("./baseline");

function matchesPattern(name, pattern) {
  if (!pattern) return false;
  const escaped = String(pattern).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(name);
}

function shouldIgnore(dep, patterns) {
  return patterns.some((pattern) => matchesPattern(dep.name, pattern));
}

async function scan(projectRoot = process.cwd(), options = {}) {
  const startedAt = Date.now();
  const root = path.resolve(projectRoot);
  const { config, path: configPath } = loadConfig(root, options.config);
  const skip = Array.from(new Set([...(config.skip || []), ...csv(options.skip)]));
  const ignore = Array.from(new Set([...(config.ignore || []), ...csv(options.ignore)]));
  const workspaces = options.workspaces ?? config.workspaces;
  const parsed = parseProject(root, { workspaces });

  if (parsed.dependencies.length === 0 && parsed.lockFiles.length === 0 && parsed.manifests.length === 0) {
    const error = new Error("No supported lock file or manifest found. Run dep-doctor from a project root or pass a path.");
    error.code = "ENOLOCK";
    throw error;
  }

  const context = {
    now: options.now ? new Date(options.now) : new Date(),
    config,
    skip,
    root
  };

  const packages = parsed.dependencies
    .filter((dep) => !shouldIgnore(dep, ignore))
    .map((dep) => {
      const checks = runChecks(dep, context);
      return scorePackage(dep, checks);
    });

  let result = {
    root,
    config,
    configPath,
    projects: parsed.projects,
    dependencies: parsed.dependencies.length,
    lockFiles: parsed.lockFiles,
    manifests: parsed.manifests,
    skipped: parsed.dependencies.length - packages.length,
    packages,
    summary: summarize(packages),
    durationMs: Date.now() - startedAt,
    baseline: { enabled: false }
  };

  const baselineFile = baselinePath(root, config, options);
  const wantsBaseline = Boolean(options.baseline || options.updateBaseline || (config.baseline && config.baseline.autoUpdate));
  if (wantsBaseline) {
    const previous = loadBaseline(baselineFile);
    if (!previous && options.createBaseline === false) {
      const error = new Error(`Baseline not found at ${baselineFile}. Run dep-doctor scan --baseline first to create it.`);
      error.code = "ENOBASELINE";
      throw error;
    }
    if (options.updateBaseline || !previous || (config.baseline && config.baseline.autoUpdate)) {
      const written = writeBaseline(baselineFile, result, previous);
      result = applyBaseline(result, written);
      result.baseline.path = baselineFile;
      result.baseline.updated = true;
    } else {
      result = applyBaseline(result, previous);
      result.baseline.path = baselineFile;
    }
  }

  return result;
}

function shouldFail(scanResult, failOn = "critical") {
  if (failOn === "none") return false;
  if (failOn === "warning") return scanResult.summary.warning > 0 || scanResult.summary.critical > 0;
  return scanResult.summary.critical > 0;
}

module.exports = {
  scan,
  shouldFail
};
