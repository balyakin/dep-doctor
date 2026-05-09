"use strict";

const depCount = require("./dep-count");
const goProxy = require("./go-proxy");
const govulncheck = require("./govulncheck");
const knownVulns = require("./known-vulns");
const licenseCheck = require("./license-check");
const maintainerActivity = require("./maintainer-activity");
const msrvCheck = require("./msrv-check");
const newMaintainers = require("./new-maintainers");
const pipAudit = require("./pip-audit");
const postinstallScripts = require("./postinstall-scripts");
const pythonEnvMismatch = require("./python-env-mismatch");
const repoMismatch = require("./repo-mismatch");
const cratesVulns = require("./crates-vulns");
const typosquatting = require("./typosquatting");
const versionFreshness = require("./version-freshness");

const CORE_CHECKS = [
  maintainerActivity,
  newMaintainers,
  versionFreshness,
  knownVulns,
  typosquatting,
  repoMismatch,
  postinstallScripts,
  depCount,
  licenseCheck
];

const ECOSYSTEM_CHECKS = {
  python: [pipAudit, pythonEnvMismatch],
  cargo: [cratesVulns, msrvCheck],
  go: [govulncheck, goProxy]
};

function checksForDependency(dep) {
  const checks = CORE_CHECKS.filter((check) => !(check.id === "known-vulns" && dep.ecosystem !== "npm"));
  return checks.concat(ECOSYSTEM_CHECKS[dep.ecosystem] || []);
}

function runChecks(dep, context) {
  const skipped = new Set(context.skip || []);
  return checksForDependency(dep)
    .filter((check) => !skipped.has(check.id))
    .map((check) => {
      try {
        return check.run(dep, context);
      } catch (error) {
        return {
          id: check.id,
          status: "warn",
          weight: check.weight,
          message: `check failed: ${error.message}`,
          details: { error: error.stack || error.message }
        };
      }
    });
}

module.exports = {
  checksForDependency,
  runChecks
};
