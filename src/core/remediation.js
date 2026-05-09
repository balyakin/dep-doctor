"use strict";

function suggestionsForPackage(result) {
  const dep = result.dependency;
  const suggestions = [];
  for (const issue of result.issues.filter((item) => !item.accepted)) {
    if (["known-vulns", "pip-audit", "crates-vulns", "govulncheck"].includes(issue.id)) {
      const advisory = issue.details && issue.details.advisories && issue.details.advisories[0];
      if (advisory && advisory.fixed) {
        const action = advisory.type === "rollback" || isLowerVersion(dep.version, advisory.fixed) ? "Rollback" : "Upgrade";
        suggestions.push({
          issue: issue.id,
          title: `${action} ${dep.name} to ${advisory.fixed}`,
          command: commandForUpgrade(dep, advisory.fixed),
          reason: advisory.type === "rollback"
            ? `${advisory.id} requires returning to the last known safe version ${advisory.fixed}`
            : `${advisory.id} fixed in ${advisory.fixed}`
        });
      }
    }
    if (issue.id === "version-freshness") {
      suggestions.push({
        issue: issue.id,
        title: "Wait for the release cooldown window or pin the previous known-good version",
        command: null,
        reason: "Fresh releases have not had community review time yet"
      });
    }
    if (issue.id === "maintainer-activity" && dep.name === "moment") {
      suggestions.push({
        issue: issue.id,
        title: "Migrate moment usage to dayjs where API-compatible",
        command: dep.ecosystem === "npm" ? commandForInstallRemove(dep, "dayjs", "moment") : null,
        reason: "moment is in maintenance mode and dayjs is a small maintained alternative"
      });
    }
    if (issue.id === "maintainer-activity" && dep.name === "request") {
      suggestions.push({
        issue: issue.id,
        title: "Replace request with undici or got",
        command: dep.ecosystem === "npm" ? commandForInstallRemove(dep, "undici", "request") : null,
        reason: "request is deprecated and no longer actively maintained"
      });
    }
    if (issue.id === "maintainer-activity" && dep.name === "left-pad") {
      suggestions.push({
        issue: issue.id,
        title: "Replace left-pad with String.prototype.padStart",
        command: dep.ecosystem === "npm" ? npmRemoveCommand(dep, "left-pad") : null,
        reason: "modern JavaScript has native left-padding support"
      });
    }
    if (issue.id === "postinstall-scripts") {
      suggestions.push({
        issue: issue.id,
        title: "Review install script contents before accepting this package",
        command: null,
        reason: "Install scripts execute arbitrary code during dependency installation"
      });
    }
    if (issue.id === "repo-mismatch" || issue.id === "new-maintainers") {
      suggestions.push({
        issue: issue.id,
        title: "Pin the previous trusted version or replace the package",
        command: null,
        reason: "Maintainer or repository provenance changed"
      });
    }
  }
  return dedupeSuggestions(suggestions);
}

function isLowerVersion(current, target) {
  const parse = (value) => String(value || "").split(".").map((part) => Number(part.replace(/\D.*$/, "")) || 0);
  const left = parse(current);
  const right = parse(target);
  for (let i = 0; i < 3; i += 1) {
    if (right[i] < left[i]) return true;
    if (right[i] > left[i]) return false;
  }
  return false;
}

const ALTERNATIVES = {
  moment: [
    { name: "dayjs", reason: "Small Moment-compatible API for common date operations" },
    { name: "date-fns", reason: "Modular functions with tree-shaking-friendly imports" },
    { name: "luxon", reason: "Modern date/time API from the Moment maintainers" }
  ],
  request: [
    { name: "undici", reason: "Maintained HTTP client from the Node.js project" },
    { name: "got", reason: "Promise-based HTTP client with active maintenance" },
    { name: "axios", reason: "Widely used HTTP client across browser and Node.js" }
  ],
  lodash: [
    { name: "native JavaScript", reason: "Modern runtimes cover many common lodash helpers" },
    { name: "just", reason: "Small single-purpose utility packages" }
  ]
};

function alternativesForPackage(dep) {
  return ALTERNATIVES[dep.name] || [];
}

function commandForUpgrade(dep, version) {
  if (dep.ecosystem === "npm") return `${dep.manager === "yarn" ? "yarn add" : dep.manager === "pnpm" ? "pnpm add" : "npm install"} ${dep.name}@${version}`;
  if (dep.ecosystem === "python") return `python -m pip install '${dep.name}==${version}'`;
  if (dep.ecosystem === "cargo") return `cargo update -p ${dep.name} --precise ${version}`;
  if (dep.ecosystem === "go") return `go get ${dep.name}@${String(version).startsWith("v") ? version : `v${version}`}`;
  return null;
}

function commandForInstallRemove(dep, installName, removeName) {
  if (dep.manager === "yarn") return `yarn add ${installName} && yarn remove ${removeName}`;
  if (dep.manager === "pnpm") return `pnpm add ${installName} && pnpm remove ${removeName}`;
  return `npm install ${installName} && npm uninstall ${removeName}`;
}

function npmRemoveCommand(dep, removeName) {
  if (dep.manager === "yarn") return `yarn remove ${removeName}`;
  if (dep.manager === "pnpm") return `pnpm remove ${removeName}`;
  return `npm uninstall ${removeName}`;
}

function dedupeSuggestions(suggestions) {
  const seen = new Set();
  return suggestions.filter((suggestion) => {
    const key = `${suggestion.title}:${suggestion.command || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectRemediations(scan) {
  return scan.packages
    .map((result) => ({
      package: result.dependency,
      status: result.effectiveStatus,
      score: result.score,
      issues: result.issues.filter((issue) => !issue.accepted),
      suggestions: suggestionsForPackage(result),
      alternatives: alternativesForPackage(result.dependency)
    }))
    .filter((item) => item.issues.length > 0);
}

module.exports = {
  alternativesForPackage,
  commandForInstallRemove,
  collectRemediations,
  commandForUpgrade,
  suggestionsForPackage
};
