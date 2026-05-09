"use strict";

const path = require("path");
const { parseGoProject } = require("./go");
const { parseNpmProject } = require("./npm");
const { parsePythonProject } = require("./python");
const { parseRustProject } = require("./rust");
const { discoverProjectRoots } = require("./workspaces");
const { uniqueBy } = require("../utils/fs");

function parseProject(projectRoot, options = {}) {
  const roots = discoverProjectRoots(projectRoot, options.workspaces || "auto");
  const projects = [];
  const dependencies = [];
  const lockFiles = [];
  const manifests = [];

  for (const root of roots) {
    const parsed = [
      parseNpmProject(root),
      parsePythonProject(root),
      parseRustProject(root),
      parseGoProject(root)
    ];
    const projectDependencies = parsed.flatMap((item) => item.dependencies);
    if (projectDependencies.length === 0 && !parsed.some((item) => item.lockFiles.length || item.manifests.length)) {
      continue;
    }
    projects.push({ root, dependencyCount: projectDependencies.length });
    dependencies.push(...projectDependencies);
    parsed.forEach((item) => {
      lockFiles.push(...item.lockFiles);
      manifests.push(...item.manifests);
    });
  }

  const deduped = uniqueBy(dependencies, (dep) => `${path.resolve(dep.projectRoot)}:${dep.key}`);
  return {
    root: path.resolve(projectRoot),
    projects,
    dependencies: deduped,
    lockFiles: uniqueBy(lockFiles, (file) => path.resolve(file)),
    manifests: uniqueBy(manifests, (file) => path.resolve(file))
  };
}

module.exports = {
  parseProject
};
