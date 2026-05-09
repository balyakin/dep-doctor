"use strict";

const path = require("path");
const { suggestionsForPackage } = require("../core/remediation");
const { emojiForStatus } = require("../core/scoring");
const { getVersion } = require("./version");
const { color, stripAnsi, supportsColor } = require("./logger");

const DEFAULT_HELP_URI = "https://github.com/dep-doctor/dep-doctor";

function visibleLength(value) {
  let width = 0;
  for (const char of stripAnsi(value)) {
    const code = char.codePointAt(0);
    if (code === 0) continue;
    if (code < 32 || (code >= 0x7f && code < 0xa0)) continue;
    width += isWideCodePoint(code) ? 2 : 1;
  }
  return width;
}

function isWideCodePoint(code) {
  return (
    code >= 0x1100 && (
      code <= 0x115f ||
      code === 0x2329 ||
      code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1faff)
    )
  );
}

function pad(value, width) {
  const text = String(value);
  return text + " ".repeat(Math.max(0, width - visibleLength(text)));
}

function fit(value, width) {
  const text = String(value);
  if (visibleLength(text) <= width) return text;
  let output = "";
  for (const char of text) {
    if (visibleLength(`${output}${char}…`) > width) break;
    output += char;
  }
  return `${output}…`;
}

function issueText(result, { diffOnly = false } = {}) {
  const issues = diffOnly ? result.issues.filter((issue) => !issue.accepted) : result.issues;
  if (!issues.length) return "—";
  return issues
    .map((issue) => `${issue.message}${issue.accepted ? " (Baseline Accepted)" : ""}`)
    .join(", ");
}

function formatTable(scan, options = {}) {
  const useColor = options.color ?? supportsColor();
  const rows = (options.diffOnly ? scan.packages.filter((pkg) => pkg.issues.some((issue) => !issue.accepted)) : scan.packages)
    .sort((a, b) => a.score - b.score || a.dependency.name.localeCompare(b.dependency.name));
  const lines = [];
  const action = options.diffOnly ? "diffing baseline for" : "scanning";
  const duration = scan.durationMs != null ? ` in ${scan.durationMs}ms` : "";
  lines.push(`${color("cyan", "🩺", useColor)} dep-doctor v${getVersion()} — ${action} ${scan.packages.length} dependencies${duration}...`);
  if (scan.baseline && scan.baseline.enabled) {
    lines.push(color("dim", `Baseline: ${scan.baseline.updated ? "updated" : "enabled"} (${path.relative(scan.root, scan.baseline.path || "") || ".dep-doctor-baseline.json"})`, useColor));
  }
  lines.push("");
  lines.push(`  ${pad("Package", 28)} ${pad("Version", 12)} ${pad("Score", 6)} ${pad("Status", 9)} Issues`);
  lines.push(`  ${"─".repeat(86)}`);
  if (!rows.length) {
    lines.push("  No packages matched this report.");
  }
  for (const result of rows) {
    const acceptedOnly = result.issues.length && result.issues.every((issue) => issue.accepted);
    const status = acceptedOnly ? result.status : (result.effectiveStatus || result.status);
    const icon = acceptedOnly ? "📉" : emojiForStatus(status);
    const rowColor = status === "Critical" ? "red" : status === "Warning" ? "yellow" : "green";
    const issueColor = result.issues.every((issue) => issue.accepted) ? "dim" : rowColor;
    const packageName = fit(`${icon} ${result.dependency.name}`, 28);
    const version = fit(result.dependency.version, 12);
    lines.push(`  ${pad(color(rowColor, packageName, useColor), 28)} ${pad(version, 12)} ${pad(result.score, 6)} ${pad(color(rowColor, status, useColor), 9)} ${color(issueColor, issueText(result, options), useColor)}`);
  }
  lines.push(`  ${"─".repeat(86)}`);
  lines.push(`Summary: ${scan.summary.healthy} healthy · ${scan.summary.warning} warning · ${scan.summary.critical} critical${scan.summary.acceptedIssues ? ` (${scan.summary.acceptedIssues} accepted in baseline)` : ""}`);
  const projectColor = scan.summary.projectStatus === "Critical" ? "red" : scan.summary.projectStatus === "Warning" ? "yellow" : "green";
  lines.push(`Project status: ${color(projectColor, `${emojiForStatus(scan.summary.projectStatus)} ${scan.summary.projectStatus.toUpperCase()}`, useColor)}`);
  if (scan.summary.critical || scan.summary.warning) {
    lines.push("");
    lines.push("💡 Run `dep-doctor fix` to interactively resolve critical issues.");
    lines.push("📖 Run `dep-doctor diff --baseline` to see only new issues.");
  }
  return `${lines.join("\n")}\n`;
}

function publicScan(scan, options = {}) {
  const packages = (options.diffOnly ? scan.packages.filter((pkg) => pkg.issues.some((issue) => !issue.accepted)) : scan.packages)
    .map((result) => ({
      package: result.dependency.name,
      version: result.dependency.version,
      ecosystem: result.dependency.ecosystem,
      manager: result.dependency.manager,
      direct: result.dependency.direct,
      score: result.score,
      status: result.effectiveStatus || result.status,
      scoreStatus: result.status,
      effectiveStatus: result.effectiveStatus,
      issues: result.issues.map((issue) => ({
        id: issue.id,
        status: issue.status,
        message: issue.message,
        accepted: Boolean(issue.accepted),
        details: issue.details || {}
      }))
    }));
  return {
    root: scan.root,
    summary: scan.summary,
    baseline: scan.baseline,
    lockFiles: scan.lockFiles,
    manifests: scan.manifests,
    packages
  };
}

function formatJson(scan, options = {}) {
  return `${JSON.stringify(publicScan(scan, options), null, 2)}\n`;
}

function escapeCell(value) {
  return String(value == null ? "" : value).replace(/\|/g, "\\|");
}

function formatMarkdown(scan, options = {}) {
  const rows = (options.diffOnly ? scan.packages.filter((pkg) => pkg.issues.some((issue) => !issue.accepted)) : scan.packages)
    .sort((a, b) => a.score - b.score || a.dependency.name.localeCompare(b.dependency.name));
  const lines = [];
  lines.push("## 🩺 dep-doctor Report");
  lines.push("");
  lines.push("| Package | Version | Score | Status | Issues |");
  lines.push("|---------|---------|-------|--------|--------|");
  for (const result of rows) {
    const acceptedOnly = result.issues.length && result.issues.every((issue) => issue.accepted);
    const status = acceptedOnly ? result.status : (result.effectiveStatus || result.status);
    const icon = acceptedOnly ? "📉" : emojiForStatus(status);
    lines.push(`| ${icon} ${escapeCell(result.dependency.name)} | ${escapeCell(result.dependency.version)} | ${result.score} | ${escapeCell(status)} | ${escapeCell(issueText(result, options))} |`);
  }
  if (!rows.length) lines.push("| — | — | — | Healthy | No new issues |");
  lines.push("");
  lines.push(`**Summary:** ${scan.summary.healthy} healthy · ${scan.summary.warning} warning · ${scan.summary.critical} critical${scan.summary.acceptedIssues ? ` (${scan.summary.acceptedIssues} accepted in baseline)` : ""}`);
  if (scan.summary.newIssues) lines.push(`**New issues (not in baseline):** ${scan.summary.newIssues}`);
  const detailRows = rows.filter((result) => (options.diffOnly ? result.issues.some((issue) => !issue.accepted) : result.issues.length));
  for (const result of detailRows) {
    const visibleIssues = options.diffOnly ? result.issues.filter((issue) => !issue.accepted) : result.issues;
    if (!visibleIssues.length) continue;
    lines.push("");
    lines.push("<details>");
    lines.push(`<summary>${emojiForStatus(result.effectiveStatus || result.status)} ${escapeCell(result.dependency.name)}@${escapeCell(result.dependency.version)} details</summary>`);
    lines.push("");
    for (const issue of visibleIssues) {
      lines.push(`- **${escapeCell(issue.id)}:** ${escapeCell(issue.message)}${issue.accepted ? " (Baseline Accepted)" : ""}`);
    }
    const suggestions = suggestionsForPackage({ ...result, issues: visibleIssues });
    for (const suggestion of suggestions.slice(0, 3)) {
      lines.push("");
      lines.push(`Suggestion: **${escapeCell(suggestion.title)}**`);
      if (suggestion.command) lines.push("");
      if (suggestion.command) lines.push(`\`${suggestion.command}\``);
    }
    lines.push("");
    lines.push("</details>");
  }
  return `${lines.join("\n")}\n`;
}

function formatSarif(scan, options = {}) {
  const results = [];
  const rules = new Map();
  for (const pkg of scan.packages) {
    for (const issue of pkg.issues) {
      if (options.diffOnly && issue.accepted) continue;
      rules.set(issue.id, {
        id: issue.id,
        shortDescription: { text: issue.id },
        fullDescription: { text: issue.message },
        helpUri: helpUri(),
        properties: {
          severity: severityForIssue(issue)
        }
      });
      results.push({
        ruleId: issue.id,
        level: issue.status === "fail" ? "error" : "warning",
        message: { text: `${pkg.dependency.name}@${pkg.dependency.version}: ${issue.message}${issue.accepted ? " (Baseline Accepted)" : ""}` },
        locations: [{
          physicalLocation: {
            artifactLocation: {
              uri: path.relative(scan.root, pkg.dependency.lockfilePath || pkg.dependency.manifestPath || scan.root) || "."
            }
          }
        }],
        properties: {
          package: pkg.dependency.name,
          version: pkg.dependency.version,
          ecosystem: pkg.dependency.ecosystem,
          severity: severityForIssue(issue),
          accepted: Boolean(issue.accepted)
        }
      });
    }
  }
  return `${JSON.stringify({
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: {
        driver: {
          name: "dep-doctor",
          version: getVersion(),
          rules: Array.from(rules.values())
        }
      },
      results
    }]
  }, null, 2)}\n`;
}

function helpUri() {
  return process.env.DEP_DOCTOR_HELP_URI || DEFAULT_HELP_URI;
}

function severityForIssue(issue) {
  if (issue.details && issue.details.severity) return issue.details.severity;
  return issue.status === "fail" ? "HIGH" : "MODERATE";
}

function formatScan(scan, options = {}) {
  const format = options.format || "table";
  if (format === "json") return formatJson(scan, options);
  if (format === "markdown") return formatMarkdown(scan, options);
  if (format === "sarif") return formatSarif(scan, options);
  return formatTable(scan, options);
}

module.exports = {
  formatJson,
  formatMarkdown,
  formatSarif,
  formatScan,
  formatTable,
  helpUri,
  publicScan
};
