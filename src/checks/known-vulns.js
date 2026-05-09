"use strict";

const { findAdvisories } = require("../providers/advisory-db");
const { fail, pass, warn } = require("./result");

const id = "known-vulns";
const weight = 5;

const severityRank = {
  LOW: 1,
  MODERATE: 2,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};

function highestSeverity(advisories) {
  return advisories.reduce((highest, advisory) => {
    const rank = severityRank[advisory.severity] || 0;
    return rank > (severityRank[highest] || 0) ? advisory.severity : highest;
  }, "LOW");
}

function vulnerabilityResult(checkId, checkWeight, dep, ecosystem) {
  const advisories = findAdvisories(ecosystem || dep.ecosystem, dep.name, dep.version);
  if (!advisories.length) return pass(checkId, checkWeight, "no known advisories in offline DB", { degraded: true });
  const severity = highestSeverity(advisories);
  const primary = advisories[0];
  const message = `${primary.id} (${severity})`;
  const details = { severity, advisories };
  if ((severityRank[severity] || 0) >= severityRank.HIGH) return fail(checkId, checkWeight, message, details);
  return warn(checkId, checkWeight, message, details);
}

function run(dep) {
  if (dep.ecosystem !== "npm") return pass(id, weight, "not an npm package", { skipped: true });
  return vulnerabilityResult(id, weight, dep, "npm");
}

module.exports = { id, run, vulnerabilityResult, weight };
