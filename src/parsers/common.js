"use strict";

const fs = require("fs");
const path = require("path");
const { safeReadJson } = require("../utils/fs");

function dependencyKey(dep) {
  return `${dep.ecosystem}:${dep.name}@${dep.version || "unknown"}`;
}

function makeDependency(input) {
  const dep = {
    ecosystem: input.ecosystem,
    manager: input.manager || input.ecosystem,
    name: input.name,
    version: input.version || "unknown",
    direct: Boolean(input.direct),
    dependencyNames: Array.from(new Set(input.dependencyNames || [])),
    transitiveCount: Number(input.transitiveCount || 0),
    manifestPath: input.manifestPath || null,
    lockfilePath: input.lockfilePath || null,
    projectRoot: input.projectRoot || process.cwd(),
    source: input.source || null,
    private: Boolean(input.private),
    license: input.license || null,
    repository: normalizeRepository(input.repository),
    publishRepository: normalizeRepository(input.publishRepository),
    scripts: input.scripts || {},
    hasInstallScript: Boolean(input.hasInstallScript),
    installScriptAgeMinorVersions: input.installScriptAgeMinorVersions ?? null,
    installScriptIntroducedIn: input.installScriptIntroducedIn || null,
    engines: input.engines || {},
    publishedAt: input.publishedAt || null,
    metadataModifiedAt: input.metadataModifiedAt || null,
    maintainers: input.maintainers || [],
    metadataSource: input.metadataSource || null,
    requiresPython: input.requiresPython || null,
    rustVersion: input.rustVersion || input.msrv || null,
    goVersion: input.goVersion || null,
    project: input.project || {}
  };
  dep.key = dependencyKey(dep);
  dep.instanceId = `${path.relative(process.cwd(), dep.projectRoot) || "."}:${dep.key}`;
  return dep;
}

function normalizeRepository(repo) {
  if (!repo) return null;
  if (typeof repo === "string") return repo.trim() || null;
  if (typeof repo === "object") return normalizeRepository(repo.url || repo.web || repo.repository);
  return null;
}

function normalizePackageName(name) {
  return String(name || "").trim();
}

function packageNameFromNodeModulesPath(lockPath) {
  const parts = String(lockPath || "").split(/[\\/]+/);
  const index = parts.lastIndexOf("node_modules");
  if (index === -1 || index === parts.length - 1) return null;
  const first = parts[index + 1];
  if (first && first.startsWith("@") && parts[index + 2]) return `${first}/${stripVersionSuffix(parts[index + 2])}`;
  return first ? stripVersionSuffix(first) : null;
}

function stripVersionSuffix(segment) {
  return String(segment || "").replace(/@\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?$/, "");
}

function packageNameFromSpecifier(specifier) {
  const raw = String(specifier || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^npm:/, "");
  if (!raw) return null;
  if (raw.startsWith("@")) {
    const slash = raw.indexOf("/");
    if (slash === -1) return raw;
    const at = raw.indexOf("@", slash);
    return at === -1 ? raw : raw.slice(0, at);
  }
  const at = raw.indexOf("@");
  return at === -1 ? raw : raw.slice(0, at);
}

function cleanVersionSpec(spec) {
  if (!spec) return "unknown";
  const value = String(spec).trim().replace(/^["']|["']$/g, "");
  if (/^(file|link|workspace|git|github|http|https):/.test(value)) return value;
  const match = value.match(/v?(\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?)/);
  return match ? match[1] : value;
}

function dependencyNamesFromManifest(manifest) {
  const sections = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
    "bundleDependencies",
    "bundledDependencies"
  ];
  const names = new Set();
  for (const section of sections) {
    const deps = manifest && manifest[section];
    if (Array.isArray(deps)) deps.forEach((name) => names.add(name));
    if (deps && typeof deps === "object" && !Array.isArray(deps)) {
      Object.keys(deps).forEach((name) => names.add(name));
    }
  }
  return names;
}

function readNodePackageMetadata(projectRoot, packageName) {
  const parts = packageName.split("/");
  const packageJson = path.join(projectRoot, "node_modules", ...parts, "package.json");
  const metadata = safeReadJson(packageJson);
  if (!metadata) return {};
  let modifiedAt = null;
  try {
    modifiedAt = fs.statSync(packageJson).mtime.toISOString();
  } catch {
    modifiedAt = null;
  }
  return {
    license: metadata.license,
    repository: metadata.repository,
    scripts: metadata.scripts || {},
    engines: metadata.engines || {},
    dependencyNames: Object.keys(metadata.dependencies || {}),
    private: metadata.private,
    maintainers: metadata.maintainers || [],
    publishedAt: metadata._publishedAt || metadata.publishedAt || null,
    publishRepository: metadata.publishRepository || metadata._publishRepository || (metadata.dist && metadata.dist.repository),
    installScriptAgeMinorVersions: metadata.installScriptAgeMinorVersions,
    installScriptIntroducedIn: metadata.installScriptIntroducedIn,
    metadataSource: packageJson,
    metadataModifiedAt: modifiedAt
  };
}

function resolveTransitiveCounts(dependencies) {
  const byName = new Map();
  for (const dep of dependencies) {
    if (!byName.has(dep.name)) byName.set(dep.name, []);
    byName.get(dep.name).push(dep);
  }

  function walk(dep) {
    const seen = new Set();
    const stack = [...(dep.dependencyNames || [])];
    while (stack.length) {
      const childName = stack.pop();
      for (const child of byName.get(childName) || []) {
        if (seen.has(child.key) || child.key === dep.key) continue;
        seen.add(child.key);
        for (const grandchildName of child.dependencyNames || []) stack.push(grandchildName);
      }
    }
    return seen;
  }

  return dependencies.map((dep) => {
    dep.transitiveCount = walk(dep).size;
    return dep;
  });
}

module.exports = {
  cleanVersionSpec,
  dependencyKey,
  dependencyNamesFromManifest,
  makeDependency,
  normalizePackageName,
  normalizeRepository,
  packageNameFromNodeModulesPath,
  packageNameFromSpecifier,
  readNodePackageMetadata,
  resolveTransitiveCounts
};
