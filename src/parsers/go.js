"use strict";

const path = require("path");
const { fileExists, safeReadText } = require("../utils/fs");
const { cleanVersionSpec, makeDependency } = require("./common");

function parseGoMod(projectRoot) {
  const modPath = path.join(projectRoot, "go.mod");
  const text = safeReadText(modPath) || "";
  const requires = new Map();
  const replacements = new Map();
  let goVersion = null;
  let inRequire = false;
  let inReplace = false;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.replace(/\/\/.*$/, "").trim();
    if (!trimmed) continue;
    const go = trimmed.match(/^go\s+(.+)$/);
    if (go) goVersion = cleanVersionSpec(go[1]);
    if (trimmed === "require (") {
      inRequire = true;
      continue;
    }
    if (inRequire && trimmed === ")") {
      inRequire = false;
      continue;
    }
    if (trimmed === "replace (") {
      inReplace = true;
      continue;
    }
    if (inReplace && trimmed === ")") {
      inReplace = false;
      continue;
    }
    const req = trimmed.match(/^require\s+([^\s]+)\s+([^\s]+)$/) || (inRequire && trimmed.match(/^([^\s]+)\s+([^\s]+)$/));
    if (req) requires.set(req[1], cleanVersionSpec(req[2]));
    const replacement = parseReplace(trimmed, inReplace);
    if (replacement) replacements.set(replacement.name, replacement);
  }

  return { path: fileExists(modPath) ? modPath : null, requires, replacements, goVersion };
}

function parseReplace(trimmed, inReplace) {
  const match = trimmed.match(/^replace\s+(.+?)\s+=>\s+(.+)$/) || (inReplace && trimmed.match(/^(.+?)\s+=>\s+(.+)$/));
  if (!match) return null;
  const left = parseModuleVersion(match[1]);
  const right = parseModuleVersion(match[2]);
  if (!left || !right) return null;
  return {
    name: left.name,
    version: left.version,
    target: right.name,
    targetVersion: right.version,
    local: right.name.startsWith(".") || path.isAbsolute(right.name)
  };
}

function parseModuleVersion(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return {
    name: parts[0],
    version: parts[1] ? cleanVersionSpec(parts[1]) : null
  };
}

function parseGoSum(projectRoot, sumPath, mod) {
  const text = safeReadText(sumPath) || "";
  const seen = new Map();
  for (const line of text.split(/\r?\n/)) {
    const [name, version] = line.trim().split(/\s+/);
    if (!name || !version || version.endsWith("/go.mod")) continue;
    const key = `${name}@${version}`;
    if (!seen.has(key)) seen.set(key, { name, version });
  }
  return Array.from(seen.values()).map((entry) => makeDependency({
    ecosystem: "go",
    manager: "go",
    name: entry.name,
    version: cleanVersionSpec(entry.version),
    direct: mod.requires.has(entry.name),
    dependencyNames: [],
    manifestPath: mod.path,
    lockfilePath: sumPath,
    projectRoot,
    source: sourceForGoModule(entry.name, mod),
    project: { goVersion: mod.goVersion }
  }));
}

function sourceFromGoProxy(name) {
  const proxy = process.env.GOPROXY || "https://proxy.golang.org,direct";
  const first = proxy.split(",")[0];
  if (!first || first === "direct" || first === "off") return "direct";
  if (!/^https?:\/\//.test(first)) return first;
  return `${first.replace(/\/+$/, "")}/${name}/@v`;
}

function sourceForGoModule(name, mod) {
  const replacement = mod.replacements && mod.replacements.get(name);
  if (!replacement) return sourceFromGoProxy(name);
  if (replacement.local) return `local:${replacement.target}`;
  return sourceFromGoProxy(replacement.target);
}

function parseGoProject(projectRoot) {
  const mod = parseGoMod(projectRoot);
  const sumPath = path.join(projectRoot, "go.sum");
  const deps = [];
  if (fileExists(sumPath)) {
    deps.push(...parseGoSum(projectRoot, sumPath, mod));
  } else {
    for (const [name, version] of mod.requires.entries()) {
      deps.push(makeDependency({
        ecosystem: "go",
        manager: "go",
        name,
        version,
        direct: true,
        dependencyNames: [],
        manifestPath: mod.path,
        lockfilePath: null,
        projectRoot,
        source: sourceForGoModule(name, mod),
        project: { goVersion: mod.goVersion }
      }));
    }
  }
  return {
    ecosystem: "go",
    dependencies: deps,
    lockFiles: fileExists(sumPath) ? [sumPath] : [],
    manifests: mod.path ? [mod.path] : []
  };
}

module.exports = {
  parseGoMod,
  parseGoProject,
  parseGoSum,
  sourceForGoModule,
  sourceFromGoProxy
};
