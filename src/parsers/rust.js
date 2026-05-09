"use strict";

const path = require("path");
const { fileExists, safeReadText } = require("../utils/fs");
const { cleanVersionSpec, makeDependency, resolveTransitiveCounts } = require("./common");

function parseCargoManifest(projectRoot) {
  const manifestPath = path.join(projectRoot, "Cargo.toml");
  const text = safeReadText(manifestPath) || "";
  const direct = new Set();
  const members = [];
  let rustVersion = null;
  let section = null;
  let collectingMembers = false;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.replace(/\s+#.*$/, "").trim();
    if (!trimmed) continue;
    if (collectingMembers) {
      parseArrayValues(trimmed).forEach((member) => members.push(member));
      if (trimmed.includes("]")) collectingMembers = false;
      continue;
    }
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]/);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    const rust = trimmed.match(/^rust-version\s*=\s*["'](.+)["']/);
    if (rust) rustVersion = rust[1];
    if (section === "dependencies" || section === "dev-dependencies" || section === "build-dependencies") {
      const dep = trimmed.match(/^([A-Za-z0-9_-]+)\s*=/);
      if (dep) direct.add(dep[1]);
    }
    if (section === "workspace") {
      const inlineMembers = trimmed.match(/^members\s*=\s*\[(.*)\]/);
      if (inlineMembers) {
        parseArrayValues(inlineMembers[1]).forEach((member) => members.push(member));
      } else if (/^members\s*=\s*\[/.test(trimmed)) {
        collectingMembers = true;
        parseArrayValues(trimmed.replace(/^members\s*=\s*\[/, "")).forEach((member) => members.push(member));
      }
    }
  }

  return {
    path: fileExists(manifestPath) ? manifestPath : null,
    direct,
    rustVersion,
    members
  };
}

function parseArrayValues(value) {
  return String(value || "")
    .replace(/[\[\]]/g, "")
    .split(",")
    .map((part) => part.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function parseCargoLock(projectRoot, lockfilePath, manifest) {
  const text = safeReadText(lockfilePath) || "";
  const deps = [];
  for (const block of text.split(/\[\[package\]\]/g).slice(1)) {
    const name = (block.match(/^\s*name\s*=\s*["'](.+)["']/m) || [])[1];
    const version = (block.match(/^\s*version\s*=\s*["'](.+)["']/m) || [])[1];
    const source = (block.match(/^\s*source\s*=\s*["'](.+)["']/m) || [])[1];
    if (!name || !version) continue;
    const dependencyNames = [];
    const depArray = block.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (depArray) {
      for (const line of depArray[1].split(/\r?\n/)) {
        const raw = line.trim().replace(/,$/, "").replace(/^["']|["']$/g, "");
        if (!raw) continue;
        dependencyNames.push(raw.split(/\s+/)[0]);
      }
    }
    deps.push(makeDependency({
      ecosystem: "cargo",
      manager: "cargo",
      name,
      version: cleanVersionSpec(version),
      direct: manifest.direct.has(name),
      dependencyNames,
      manifestPath: manifest.path,
      lockfilePath,
      projectRoot,
      source,
      project: { rustVersion: manifest.rustVersion }
    }));
  }
  return resolveTransitiveCounts(deps);
}

function parseRustProject(projectRoot) {
  const manifest = parseCargoManifest(projectRoot);
  const lockfilePath = path.join(projectRoot, "Cargo.lock");
  const deps = fileExists(lockfilePath) ? parseCargoLock(projectRoot, lockfilePath, manifest) : [];
  return {
    ecosystem: "cargo",
    dependencies: deps,
    lockFiles: fileExists(lockfilePath) ? [lockfilePath] : [],
    manifests: manifest.path ? [manifest.path] : [],
    workspaceMembers: manifest.members
  };
}

module.exports = {
  parseCargoLock,
  parseCargoManifest,
  parseRustProject
};
