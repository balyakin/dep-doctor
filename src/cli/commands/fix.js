"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline/promises");
const { spawnSync } = require("child_process");
const { scan } = require("../../core/orchestrator");
const { collectRemediations } = require("../../core/remediation");
const { parseArgs } = require("../../utils/cli-args");

function shellSplit(command) {
  const parts = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < String(command || "").length; i += 1) {
    const char = command[i];
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}

function splitCommandSequence(command) {
  return String(command || "")
    .split(/\s+&&\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function createRollback(scanResult, target) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rollbackRoot = path.join(target, ".dep-doctor-rollback", timestamp);
  const files = [...(scanResult.manifests || []), ...(scanResult.lockFiles || [])];
  for (const file of files) {
    if (!file || !fs.existsSync(file)) continue;
    const relative = path.relative(target, file);
    const backup = path.join(rollbackRoot, relative);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(file, backup);
  }
  return rollbackRoot;
}

function restoreRollback(rollbackRoot, target) {
  if (!rollbackRoot || !fs.existsSync(rollbackRoot)) return;
  const restore = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const source = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        restore(source);
        continue;
      }
      const destination = path.join(target, path.relative(rollbackRoot, source));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    }
  };
  restore(rollbackRoot);
}

function applySuggestion(command, target, scanResult) {
  const commands = splitCommandSequence(command);
  if (!commands.length) return 0;
  const rollback = createRollback(scanResult, target);
  process.stdout.write(`Rollback snapshot: ${path.relative(process.cwd(), rollback)}\n`);
  for (const step of commands) {
    const parts = shellSplit(step);
    if (!parts.length) continue;
    const result = spawnSync(parts[0], parts.slice(1), { cwd: target, stdio: "inherit" });
    if (result.error) {
      process.stderr.write(`Failed to run ${parts[0]}: ${result.error.message}\n`);
      restoreRollback(rollback, target);
      return 1;
    }
    if (result.status) {
      restoreRollback(rollback, target);
      process.stderr.write(`Command exited with ${result.status}. Restored files from ${rollback}.\n`);
      return result.status;
    }
  }
  return 0;
}

async function run(argv) {
  const { args, flags } = parseArgs(argv);
  const target = path.resolve(process.cwd(), args[0] || ".");
  const scanResult = await scan(target, {
    baseline: Boolean(flags.baseline),
    workspaces: flags.workspaces === undefined ? undefined : flags.workspaces,
    skip: flags.skip,
    ignore: flags.ignore,
    config: flags.config,
    baselinePath: flags["baseline-path"]
  });
  const remediations = collectRemediations(scanResult);
  if (!remediations.length) {
    process.stdout.write("No unaccepted issues need remediation.\n");
    return 0;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY || flags.interactive === false) {
    for (const item of remediations) printRemediation(item);
    process.stdout.write("\nRun `dep-doctor fix` in an interactive terminal to apply suggestions with rollback snapshots.\n");
    return 0;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const item of remediations) {
      printRemediation(item);
      const actionable = item.suggestions.find((suggestion) => suggestion.command);
      const answer = await rl.question("\n[Apply upgrade] [Ignore] [More info] [View alternatives] > ");
      const normalized = answer.trim().toLowerCase();
      if ((normalized === "a" || normalized.startsWith("apply")) && actionable) {
        const code = applySuggestion(actionable.command, target, scanResult);
        if (code) return code;
      } else if (normalized === "m" || normalized.startsWith("more")) {
        for (const issue of item.issues) {
          process.stdout.write(`\n${issue.id}\n${JSON.stringify(issue.details || {}, null, 2)}\n`);
        }
      } else if (normalized === "v" || normalized.startsWith("view")) {
        printAlternatives(item);
      }
    }
  } finally {
    rl.close();
  }
  return 0;
}

function printRemediation(item) {
    const icon = item.status === "Critical" ? "🚨" : "⚠️";
    process.stdout.write(`\n${icon} ${item.package.name}@${item.package.version} (${item.score}/100)\n`);
    for (const issue of item.issues) process.stdout.write(`   - ${issue.id}: ${issue.message}\n`);
    if (!item.suggestions.length) {
      process.stdout.write("   Suggestion: Review package manually and pin a known-good version.\n");
      return;
    }
    for (const suggestion of item.suggestions) {
      process.stdout.write(`   Suggestion: ${suggestion.title}\n`);
      process.stdout.write(`   Reason: ${suggestion.reason}\n`);
      if (suggestion.command) process.stdout.write(`   Command: ${suggestion.command}\n`);
    }
    if (item.alternatives && item.alternatives.length) {
      process.stdout.write("   Alternatives: available via [View alternatives]\n");
    }
}

function printAlternatives(item) {
  const alternatives = item.alternatives || [];
  if (!alternatives.length) {
    process.stdout.write("\nNo curated alternatives are available for this package.\n");
    return;
  }
  process.stdout.write("\nAlternatives:\n");
  for (const alternative of alternatives) {
    process.stdout.write(`   - ${alternative.name}: ${alternative.reason}\n`);
  }
}

module.exports = { applySuggestion, printAlternatives, restoreRollback, run, shellSplit, splitCommandSequence };
