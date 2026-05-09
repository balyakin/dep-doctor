"use strict";

const path = require("path");
const { fileExists, readJson, safeReadJson, safeReadText } = require("../utils/fs");
const {
  cleanVersionSpec,
  dependencyNamesFromManifest,
  makeDependency,
  packageNameFromNodeModulesPath,
  packageNameFromSpecifier,
  readNodePackageMetadata,
  resolveTransitiveCounts
} = require("./common");

function readManifest(projectRoot) {
  const manifestPath = path.join(projectRoot, "package.json");
  return {
    path: fileExists(manifestPath) ? manifestPath : null,
    data: safeReadJson(manifestPath) || {}
  };
}

function directDependencySet(manifest) {
  return dependencyNamesFromManifest(manifest || {});
}

function mergeNodeMetadata(projectRoot, name, base) {
  const local = readNodePackageMetadata(projectRoot, name);
  return {
    ...base,
    license: base.license ?? local.license,
    repository: base.repository ?? local.repository,
    scripts: Object.keys(base.scripts || {}).length ? base.scripts : (local.scripts || {}),
    engines: base.engines || local.engines || {},
    dependencyNames: Array.from(new Set([...(base.dependencyNames || []), ...(local.dependencyNames || [])])),
    private: base.private ?? local.private,
    maintainers: base.maintainers || local.maintainers || [],
    publishedAt: base.publishedAt || local.publishedAt || null,
    publishRepository: base.publishRepository ?? local.publishRepository,
    installScriptAgeMinorVersions: base.installScriptAgeMinorVersions ?? local.installScriptAgeMinorVersions,
    installScriptIntroducedIn: base.installScriptIntroducedIn || local.installScriptIntroducedIn || null,
    metadataSource: base.metadataSource || local.metadataSource || null,
    metadataModifiedAt: base.metadataModifiedAt || local.metadataModifiedAt || null
  };
}

function parsePackageLock(projectRoot, lockfilePath, manifestPath, manifest) {
  const lock = readJson(lockfilePath);
  const direct = directDependencySet(manifest);
  const deps = [];

  if (lock.packages && typeof lock.packages === "object") {
    for (const [packagePath, info] of Object.entries(lock.packages)) {
      if (!packagePath || !info || typeof info !== "object") continue;
      const name = info.name || packageNameFromNodeModulesPath(packagePath);
      if (!name || !info.version) continue;
      const merged = mergeNodeMetadata(projectRoot, name, {
        ecosystem: "npm",
        manager: "npm",
        name,
        version: cleanVersionSpec(info.version),
        direct: direct.has(name),
        dependencyNames: Object.keys(info.dependencies || {}),
        manifestPath,
        lockfilePath,
        projectRoot,
        source: info.resolved || null,
        license: info.license || null,
        repository: info.repository || null,
        publishRepository: info.publishRepository || null,
        scripts: info.scripts || {},
        hasInstallScript: Boolean(info.hasInstallScript),
        installScriptAgeMinorVersions: info.installScriptAgeMinorVersions,
        installScriptIntroducedIn: info.installScriptIntroducedIn,
        engines: info.engines || {},
        private: info.private
      });
      deps.push(makeDependency(merged));
    }
    return resolveTransitiveCounts(deps);
  }

  function visit(tree, name) {
    if (!tree || typeof tree !== "object") return;
    const packageName = name || tree.name;
    if (!packageName || !tree.version) return;
    const merged = mergeNodeMetadata(projectRoot, packageName, {
      ecosystem: "npm",
      manager: "npm",
      name: packageName,
      version: cleanVersionSpec(tree.version),
      direct: direct.has(packageName),
      dependencyNames: Object.keys(tree.requires || tree.dependencies || {}),
      manifestPath,
      lockfilePath,
      projectRoot,
      source: tree.resolved || null,
      license: tree.license || null,
      publishRepository: tree.publishRepository || null,
      scripts: tree.scripts || {},
      hasInstallScript: Boolean(tree.hasInstallScript),
      installScriptAgeMinorVersions: tree.installScriptAgeMinorVersions,
      installScriptIntroducedIn: tree.installScriptIntroducedIn
    });
    deps.push(makeDependency(merged));
    for (const [childName, child] of Object.entries(tree.dependencies || {})) visit(child, childName);
  }

  for (const [name, tree] of Object.entries(lock.dependencies || {})) visit(tree, name);
  return resolveTransitiveCounts(deps);
}

function parsePackageJsonOnly(projectRoot, manifestPath, manifest) {
  const deps = [];
  const sections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
  for (const section of sections) {
    for (const [name, spec] of Object.entries(manifest[section] || {})) {
      const merged = mergeNodeMetadata(projectRoot, name, {
        ecosystem: "npm",
        manager: "npm",
        name,
        version: cleanVersionSpec(spec),
        direct: true,
        dependencyNames: [],
        manifestPath,
        lockfilePath: null,
        projectRoot,
        private: false
      });
      deps.push(makeDependency(merged));
    }
  }
  return resolveTransitiveCounts(deps);
}

function parseYarnLock(projectRoot, lockfilePath, manifestPath, manifest) {
  const text = safeReadText(lockfilePath) || "";
  const direct = directDependencySet(manifest);
  const deps = [];
  let current = null;
  let inDependencies = false;

  function flush() {
    if (!current || !current.name || !current.version) return;
    const merged = mergeNodeMetadata(projectRoot, current.name, {
      ecosystem: "npm",
      manager: "yarn",
      name: current.name,
      version: cleanVersionSpec(current.version),
      direct: direct.has(current.name),
      dependencyNames: current.dependencyNames || [],
      manifestPath,
      lockfilePath,
      projectRoot,
      source: current.resolved || null
    });
    deps.push(makeDependency(merged));
  }

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line) && line.trim().endsWith(":")) {
      flush();
      const specs = line.trim().slice(0, -1).split(/,\s*/);
      const name = packageNameFromSpecifier(specs[0]);
      current = { name, dependencyNames: [] };
      inDependencies = false;
      continue;
    }
    if (!current) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith("version ")) {
      current.version = trimmed.replace(/^version\s+/, "").replace(/^["']|["']$/g, "");
      inDependencies = false;
    } else if (trimmed.startsWith("resolved ")) {
      current.resolved = trimmed.replace(/^resolved\s+/, "").replace(/^["']|["']$/g, "");
      inDependencies = false;
    } else if (trimmed === "dependencies:") {
      inDependencies = true;
    } else if (inDependencies) {
      const match = trimmed.match(/^("?@?[^"\s:]+"?)\s+/);
      if (match) current.dependencyNames.push(match[1].replace(/^["']|["']$/g, ""));
    }
  }
  flush();
  return resolveTransitiveCounts(deps);
}

function parsePnpmLock(projectRoot, lockfilePath, manifestPath, manifest) {
  const text = safeReadText(lockfilePath) || "";
  const direct = directDependencySet(manifest);
  const deps = [];
  let inPackages = false;
  let current = null;
  let inDependencies = false;

  function parsePnpmKey(rawKey) {
    let key = rawKey.trim().replace(/^["']|["']$/g, "");
    if (key.startsWith("/")) key = key.slice(1);
    key = key.replace(/\(.+\)$/, "");
    const at = key.startsWith("@") ? key.indexOf("@", key.indexOf("/") + 1) : key.lastIndexOf("@");
    if (at <= 0) return null;
    return { name: key.slice(0, at), version: cleanVersionSpec(key.slice(at + 1)) };
  }

  function flush() {
    if (!current) return;
    const merged = mergeNodeMetadata(projectRoot, current.name, {
      ecosystem: "npm",
      manager: "pnpm",
      name: current.name,
      version: current.version,
      direct: direct.has(current.name),
      dependencyNames: current.dependencyNames || [],
      manifestPath,
      lockfilePath,
      projectRoot
    });
    deps.push(makeDependency(merged));
  }

  for (const line of text.split(/\r?\n/)) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages && /^\S/.test(line) && !/^packages:/.test(line)) {
      flush();
      current = null;
      inPackages = false;
    }
    if (!inPackages) continue;
    const entry = line.match(/^ {2}([^ ].*):\s*$/);
    if (entry) {
      flush();
      const parsed = parsePnpmKey(entry[1]);
      current = parsed ? { ...parsed, dependencyNames: [] } : null;
      inDependencies = false;
      continue;
    }
    if (!current) continue;
    const trimmed = line.trim();
    if (trimmed === "dependencies:" || trimmed === "optionalDependencies:") {
      inDependencies = true;
      continue;
    }
    if (/^[A-Za-z].*:/.test(trimmed) && !trimmed.startsWith("dependencies:")) {
      inDependencies = false;
    }
    if (inDependencies) {
      const match = trimmed.match(/^("?@?[^"\s:]+"?):\s+/);
      if (match) current.dependencyNames.push(match[1].replace(/^["']|["']$/g, ""));
    }
  }
  flush();
  return resolveTransitiveCounts(deps);
}

function parseNpmProject(projectRoot) {
  const manifest = readManifest(projectRoot);
  const results = [];
  const lockfiles = [];

  const packageLock = path.join(projectRoot, "package-lock.json");
  const yarnLock = path.join(projectRoot, "yarn.lock");
  const pnpmLock = path.join(projectRoot, "pnpm-lock.yaml");

  if (fileExists(packageLock)) {
    lockfiles.push(packageLock);
    results.push(...parsePackageLock(projectRoot, packageLock, manifest.path, manifest.data));
  }
  if (fileExists(yarnLock)) {
    lockfiles.push(yarnLock);
    results.push(...parseYarnLock(projectRoot, yarnLock, manifest.path, manifest.data));
  }
  if (fileExists(pnpmLock)) {
    lockfiles.push(pnpmLock);
    results.push(...parsePnpmLock(projectRoot, pnpmLock, manifest.path, manifest.data));
  }
  if (results.length === 0 && manifest.path) {
    results.push(...parsePackageJsonOnly(projectRoot, manifest.path, manifest.data));
  }

  return {
    ecosystem: "npm",
    dependencies: results,
    lockFiles: lockfiles,
    manifests: manifest.path ? [manifest.path] : []
  };
}

module.exports = {
  parseNpmProject,
  parsePackageJsonOnly,
  parsePackageLock,
  parsePnpmLock,
  parseYarnLock
};
