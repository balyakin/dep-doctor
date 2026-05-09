"use strict";

const path = require("path");
const { fileExists, readJson, safeReadText } = require("../utils/fs");
const { cleanVersionSpec, makeDependency, resolveTransitiveCounts } = require("./common");

function parsePyProject(projectRoot) {
  const pyproject = path.join(projectRoot, "pyproject.toml");
  const text = safeReadText(pyproject) || "";
  const metadata = { path: fileExists(pyproject) ? pyproject : null, pythonVersion: null, direct: new Map() };
  let inProjectDependencies = false;
  let inPoetryDependencies = false;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[.+\]/.test(trimmed)) {
      inProjectDependencies = trimmed === "[project]";
      inPoetryDependencies = trimmed === "[tool.poetry.dependencies]";
      continue;
    }
    const requiresPython = trimmed.match(/^requires-python\s*=\s*["'](.+)["']/);
    if (requiresPython) metadata.pythonVersion = requiresPython[1];
    const poetryPython = inPoetryDependencies && trimmed.match(/^python\s*=\s*["'](.+)["']/);
    if (poetryPython) metadata.pythonVersion = poetryPython[1];
    if (inPoetryDependencies && !trimmed.startsWith("python")) {
      const dep = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
      if (dep) metadata.direct.set(dep[1], cleanVersionSpec(dep[2]));
    }
    if (inProjectDependencies) {
      const dep = trimmed.match(/^["']([A-Za-z0-9_.-]+)(?:\[.+\])?\s*([<>=!~]=?.*)?["'],?$/);
      if (dep) metadata.direct.set(dep[1], cleanVersionSpec(dep[2] || ""));
    }
  }
  return metadata;
}

function parseRequirements(projectRoot, requirementsPath, project) {
  const deps = [];
  const text = safeReadText(requirementsPath) || "";
  for (const line of text.split(/\r?\n/)) {
    const cleaned = line.replace(/\s+#.*$/, "").trim();
    if (!cleaned || cleaned.startsWith("-") || cleaned.startsWith("#")) continue;
    const match = cleaned.match(/^([A-Za-z0-9_.-]+)(?:\[.*\])?\s*(==|=|~=|>=|<=|>|<)?\s*([^;\s]+)?/);
    if (!match) continue;
    deps.push(makeDependency({
      ecosystem: "python",
      manager: "pip",
      name: match[1].replace(/_/g, "-"),
      version: cleanVersionSpec(match[3] || match[2] || "unknown"),
      direct: true,
      manifestPath: requirementsPath,
      lockfilePath: requirementsPath,
      projectRoot,
      project
    }));
  }
  return deps;
}

function parsePoetryLock(projectRoot, lockfilePath, pyproject) {
  const text = safeReadText(lockfilePath) || "";
  const deps = [];
  for (const block of text.split(/\[\[package\]\]/g).slice(1)) {
    const name = (block.match(/^\s*name\s*=\s*["'](.+)["']/m) || [])[1];
    const version = (block.match(/^\s*version\s*=\s*["'](.+)["']/m) || [])[1];
    const pythonVersions = (block.match(/^\s*python-versions\s*=\s*["'](.+)["']/m) || [])[1];
    const license = (block.match(/^\s*license\s*=\s*["'](.+)["']/m) || [])[1];
    if (!name || !version) continue;

    const dependencyNames = [];
    const depSection = block.match(/\[package\.dependencies\]([\s\S]*?)(?:\n\[|$)/);
    if (depSection) {
      for (const line of depSection[1].split(/\r?\n/)) {
        const dep = line.trim().match(/^([A-Za-z0-9_.-]+)\s*=/);
        if (dep && dep[1] !== "python") dependencyNames.push(dep[1].replace(/_/g, "-"));
      }
    }

    deps.push(makeDependency({
      ecosystem: "python",
      manager: "poetry",
      name: name.replace(/_/g, "-"),
      version: cleanVersionSpec(version),
      direct: pyproject.direct.has(name) || pyproject.direct.has(name.replace(/_/g, "-")),
      dependencyNames,
      manifestPath: pyproject.path,
      lockfilePath,
      projectRoot,
      license,
      requiresPython: pythonVersions || null,
      project: { pythonVersion: pyproject.pythonVersion }
    }));
  }
  return resolveTransitiveCounts(deps);
}

function parsePipfileLock(projectRoot, lockfilePath) {
  const lock = readJson(lockfilePath);
  const pythonVersion = lock._meta && lock._meta.requires && lock._meta.requires.python_version;
  const deps = [];
  for (const section of ["default", "develop"]) {
    for (const [name, info] of Object.entries(lock[section] || {})) {
      const version = typeof info === "string" ? info : info.version;
      deps.push(makeDependency({
        ecosystem: "python",
        manager: "pipenv",
        name: name.replace(/_/g, "-"),
        version: cleanVersionSpec(version),
        direct: true,
        dependencyNames: [],
        manifestPath: lockfilePath,
        lockfilePath,
        projectRoot,
        project: { pythonVersion },
        requiresPython: typeof info === "object" ? extractPythonVersionMarker(info.markers) : null
      }));
    }
  }
  return deps;
}

function extractPythonVersionMarker(markers) {
  if (!markers || !String(markers).includes("python")) return null;
  if (/\bor\b/i.test(String(markers))) return null;
  const constraints = [];
  const regex = /python_(?:full_)?version\s*(==|!=|<=|>=|<|>|~=)\s*["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(String(markers))) !== null) {
    const op = match[1];
    const version = match[2];
    if (op === "!=") continue;
    constraints.push(`${op === "~=" ? ">=" : op}${version}`);
  }
  return constraints.length ? constraints.join(" ") : null;
}

function parsePythonProject(projectRoot) {
  const pyproject = parsePyProject(projectRoot);
  const results = [];
  const lockFiles = [];
  const manifests = pyproject.path ? [pyproject.path] : [];
  const poetryLock = path.join(projectRoot, "poetry.lock");
  const pipfileLock = path.join(projectRoot, "Pipfile.lock");
  const requirements = path.join(projectRoot, "requirements.txt");

  if (fileExists(poetryLock)) {
    lockFiles.push(poetryLock);
    results.push(...parsePoetryLock(projectRoot, poetryLock, pyproject));
  }
  if (fileExists(pipfileLock)) {
    lockFiles.push(pipfileLock);
    results.push(...parsePipfileLock(projectRoot, pipfileLock));
  }
  if (fileExists(requirements)) {
    lockFiles.push(requirements);
    results.push(...parseRequirements(projectRoot, requirements, { pythonVersion: pyproject.pythonVersion }));
  }

  return {
    ecosystem: "python",
    dependencies: resolveTransitiveCounts(results),
    lockFiles,
    manifests
  };
}

module.exports = {
  parsePipfileLock,
  parsePoetryLock,
  parsePyProject,
  parsePythonProject,
  parseRequirements,
  extractPythonVersionMarker
};
