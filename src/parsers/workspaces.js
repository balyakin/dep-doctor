"use strict";

const fs = require("fs");
const path = require("path");
const { dirExists, fileExists, safeReadJson, safeReadText, uniqueBy } = require("../utils/fs");
const { parseCargoManifest } = require("./rust");

const PROJECT_MARKERS = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "package.json",
  "poetry.lock",
  "Pipfile.lock",
  "requirements.txt",
  "pyproject.toml",
  "Cargo.lock",
  "Cargo.toml",
  "go.sum",
  "go.mod"
];

const SKIP_DIRS = new Set([".git", "node_modules", "target", "dist", "build", ".cache", ".venv", "venv"]);

function hasProjectMarker(dir) {
  return PROJECT_MARKERS.some((marker) => fileExists(path.join(dir, marker)));
}

function expandPattern(root, pattern) {
  const cleaned = String(pattern || "").replace(/^["']|["']$/g, "");
  if (!cleaned) return [];
  if (!cleaned.includes("*")) {
    const absolute = path.resolve(root, cleaned);
    return dirExists(absolute) ? [absolute] : [];
  }
  const beforeStar = cleaned.slice(0, cleaned.indexOf("*")).replace(/[\\/]+$/, "");
  const base = path.resolve(root, beforeStar || ".");
  if (!dirExists(base)) return [];
  const recursive = cleaned.includes("**");
  const dirs = [];
  const visit = (dir, depth) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (hasProjectMarker(full)) dirs.push(full);
      if (recursive || depth < 1) visit(full, depth + 1);
    }
  };
  visit(base, 0);
  return dirs;
}

function packageJsonWorkspaceRoots(root) {
  const pkg = safeReadJson(path.join(root, "package.json"));
  if (!pkg || !pkg.workspaces) return [];
  const patterns = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages;
  if (!Array.isArray(patterns)) return [];
  return patterns.flatMap((pattern) => expandPattern(root, pattern));
}

function pnpmWorkspaceRoots(root) {
  const text = safeReadText(path.join(root, "pnpm-workspace.yaml")) || "";
  if (!text) return [];
  const patterns = [];
  let inPackages = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "packages:") {
      inPackages = true;
      continue;
    }
    if (inPackages && trimmed.startsWith("- ")) patterns.push(trimmed.slice(2).replace(/^["']|["']$/g, ""));
    if (inPackages && trimmed && !trimmed.startsWith("- ") && !line.startsWith(" ")) inPackages = false;
  }
  return patterns.flatMap((pattern) => expandPattern(root, pattern));
}

function cargoWorkspaceRoots(root) {
  const manifest = parseCargoManifest(root);
  return manifest.members.flatMap((member) => expandPattern(root, member));
}

function poetryWorkspaceRoots(root) {
  const text = safeReadText(path.join(root, "pyproject.toml")) || "";
  const patterns = [];
  let section = null;
  let collectingMembers = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.replace(/\s+#.*$/, "").trim();
    if (!trimmed) continue;
    if (collectingMembers) {
      parseInlineArray(trimmed).forEach((pattern) => patterns.push(pattern));
      if (trimmed.includes("]")) collectingMembers = false;
      continue;
    }
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]/);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    if (section === "tool.poetry.workspace" || section === "tool.uv.workspace") {
      const inline = trimmed.match(/^members\s*=\s*\[(.*)\]/);
      if (inline) {
        parseInlineArray(inline[1]).forEach((pattern) => patterns.push(pattern));
      } else if (/^members\s*=\s*\[/.test(trimmed)) {
        collectingMembers = true;
        parseInlineArray(trimmed.replace(/^members\s*=\s*\[/, "")).forEach((pattern) => patterns.push(pattern));
      }
    }
  }
  return patterns.flatMap((pattern) => expandPattern(root, pattern));
}

function parseInlineArray(value) {
  return String(value || "")
    .replace(/[\[\]]/g, "")
    .split(",")
    .map((part) => part.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function goWorkspaceRoots(root) {
  const text = safeReadText(path.join(root, "go.work")) || "";
  const roots = [];
  let inUse = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.replace(/\/\/.*$/, "").trim();
    if (!trimmed) continue;
    if (trimmed === "use (") {
      inUse = true;
      continue;
    }
    if (inUse && trimmed === ")") {
      inUse = false;
      continue;
    }
    const single = trimmed.match(/^use\s+(.+)$/);
    const candidate = single ? single[1] : (inUse ? trimmed : null);
    if (candidate) {
      const absolute = path.resolve(root, candidate.replace(/^["']|["']$/g, ""));
      if (dirExists(absolute)) roots.push(absolute);
    }
  }
  return roots;
}

function recursiveProjectRoots(root, maxDepth = 5) {
  const roots = [];
  const visit = (dir, depth) => {
    if (depth > maxDepth) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (hasProjectMarker(full)) roots.push(full);
      visit(full, depth + 1);
    }
  };
  visit(root, 0);
  return roots;
}

function discoverProjectRoots(root, mode = "auto") {
  const absoluteRoot = path.resolve(root);
  const roots = [absoluteRoot];
  const enabled = !(mode === false || mode === "false" || mode === "none");
  if (enabled) {
    const workspaceRoots = [
      ...packageJsonWorkspaceRoots(absoluteRoot),
      ...pnpmWorkspaceRoots(absoluteRoot),
      ...poetryWorkspaceRoots(absoluteRoot),
      ...cargoWorkspaceRoots(absoluteRoot),
      ...goWorkspaceRoots(absoluteRoot)
    ];
    roots.push(...workspaceRoots);
  }
  if (mode === "recursive") roots.push(...recursiveProjectRoots(absoluteRoot));
  return uniqueBy(roots.filter(dirExists), (dir) => path.resolve(dir));
}

module.exports = {
  discoverProjectRoots,
  expandPattern,
  hasProjectMarker,
  poetryWorkspaceRoots,
  recursiveProjectRoots
};
