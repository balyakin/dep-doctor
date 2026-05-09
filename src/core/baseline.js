"use strict";

const fs = require("fs");
const path = require("path");
const { fileExists } = require("../utils/fs");
const { effectiveStatus, summarize } = require("./scoring");

function baselinePath(projectRoot, config, options = {}) {
  const configured = options.baselinePath || (config.baseline && config.baseline.path) || ".dep-doctor-baseline.json";
  return path.resolve(projectRoot, configured);
}

function stableIssueKey(packageKey, issue) {
  return `${packageKey}:${issue.id || issue.check}`;
}

function issueFingerprint(result, issue) {
  return stableIssueKey(result.dependency.key, issue);
}

function loadBaseline(filePath) {
  if (!filePath || !fileExists(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    error.message = `Could not read baseline ${filePath}: ${error.message}`;
    throw error;
  }
}

function serializeBaseline(scan) {
  const packages = {};
  for (const result of scan.packages) {
    packages[result.dependency.key] = {
      score: result.score,
      status: result.status,
      issues: result.issues.map((issue) => ({
        key: issueFingerprint(result, issue),
        check: issue.id,
        status: issue.status,
        message: issue.message
      }))
    };
  }
  return {
    version: 1,
    tool: "dep-doctor",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    root: scan.root,
    packages
  };
}

function writeBaseline(filePath, scan, previous = null) {
  const data = serializeBaseline(scan);
  if (previous && previous.createdAt) data.createdAt = previous.createdAt;
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return data;
}

function baselineIssueSet(baseline) {
  const keys = new Set();
  if (!baseline || !baseline.packages) return keys;
  for (const [packageKey, pkg] of Object.entries(baseline.packages)) {
    for (const issue of pkg.issues || []) {
      if (issue.key) keys.add(issue.key);
      if (issue.check) keys.add(stableIssueKey(packageKey, issue));
      if (issue.check && issue.status && issue.message) keys.add(`${packageKey}:${issue.check}:${issue.status}:${issue.message}`);
    }
  }
  return keys;
}

function applyBaseline(scan, baseline) {
  const accepted = baselineIssueSet(baseline);
  const packages = scan.packages.map((result) => {
    for (const issue of result.issues) {
      issue.accepted = accepted.has(issueFingerprint(result, issue));
    }
    result.acceptedIssues = result.issues.filter((issue) => issue.accepted);
    result.newIssues = result.issues.filter((issue) => !issue.accepted);
    result.effectiveStatus = effectiveStatus(result);
    return result;
  });
  return {
    ...scan,
    packages,
    baseline: {
      enabled: true,
      createdAt: baseline && baseline.createdAt,
      updatedAt: baseline && baseline.updatedAt
    },
    durationMs: scan.durationMs,
    summary: summarize(packages)
  };
}

module.exports = {
  applyBaseline,
  baselinePath,
  issueFingerprint,
  loadBaseline,
  serializeBaseline,
  stableIssueKey,
  writeBaseline
};
