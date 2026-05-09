"use strict";

const CHECK_VALUE = {
  pass: 1,
  warn: 0.5,
  fail: 0
};

function scoreChecks(checks) {
  const active = checks.filter((check) => check.status !== "skipped");
  if (!active.length) return 100;
  const totalWeight = active.reduce((sum, check) => sum + Number(check.weight || 0), 0);
  if (!totalWeight) return 100;
  const weighted = active.reduce((sum, check) => sum + Number(check.weight || 0) * (CHECK_VALUE[check.status] ?? 0), 0);
  return Math.round((weighted / totalWeight) * 100);
}

function statusFromScore(score) {
  if (score >= 80) return "Healthy";
  if (score >= 50) return "Warning";
  return "Critical";
}

function emojiForStatus(status) {
  if (status === "Healthy") return "✅";
  if (status === "Warning") return "⚠️";
  if (status === "Accepted") return "📉";
  return "🚨";
}

function effectiveStatus(result) {
  const newIssues = result.issues.filter((issue) => !issue.accepted);
  if (newIssues.some((issue) => issue.status === "fail")) return "Critical";
  if (newIssues.some((issue) => issue.status === "warn")) return "Warning";
  return "Healthy";
}

function scorePackage(dependency, checks) {
  const score = scoreChecks(checks);
  const status = statusFromScore(score);
  const issues = checks.filter((check) => check.status === "warn" || check.status === "fail");
  const result = {
    dependency,
    checks,
    issues,
    score,
    status
  };
  result.effectiveStatus = effectiveStatus(result);
  return result;
}

function summarize(packageResults) {
  const summary = {
    total: packageResults.length,
    healthy: 0,
    warning: 0,
    critical: 0,
    accepted: 0,
    newIssues: 0,
    acceptedIssues: 0,
    projectStatus: "Healthy",
    score: 100
  };

  if (!packageResults.length) return summary;

  let totalScore = 0;
  for (const result of packageResults) {
    const status = result.effectiveStatus || effectiveStatus(result);
    totalScore += result.score;
    if (status === "Critical") summary.critical += 1;
    else if (status === "Warning") summary.warning += 1;
    else summary.healthy += 1;
    const acceptedIssues = result.issues.filter((issue) => issue.accepted).length;
    const newIssues = result.issues.length - acceptedIssues;
    summary.acceptedIssues += acceptedIssues;
    summary.newIssues += newIssues;
    if (acceptedIssues && !newIssues) summary.accepted += 1;
  }

  summary.score = Math.round(totalScore / packageResults.length);
  if (summary.critical > 0) summary.projectStatus = "Critical";
  else if (summary.warning > 0) summary.projectStatus = "Warning";
  else summary.projectStatus = "Healthy";
  return summary;
}

module.exports = {
  CHECK_VALUE,
  effectiveStatus,
  emojiForStatus,
  scoreChecks,
  scorePackage,
  statusFromScore,
  summarize
};
