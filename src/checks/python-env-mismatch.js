"use strict";

const { coerceVersion, satisfiesRange } = require("../utils/semver");
const { fail, pass, warn } = require("./result");

const id = "python-env-mismatch";
const weight = 3;

function run(dep) {
  const projectPython = dep.project && dep.project.pythonVersion;
  if (!projectPython || !dep.requiresPython) return pass(id, weight, "python version compatibility unavailable offline", { degraded: true });
  if (satisfiesRange(projectPython, dep.requiresPython)) return pass(id, weight, "python version compatible");
  const projectMajor = coerceVersion(projectPython)?.[0];
  const requiredMajor = coerceVersion(dep.requiresPython)?.[0];
  if (projectMajor && requiredMajor && projectMajor !== requiredMajor) {
    return fail(id, weight, `requires Python ${dep.requiresPython}, project is ${projectPython}`, { projectPython, requiresPython: dep.requiresPython });
  }
  return warn(id, weight, `requires Python ${dep.requiresPython}, project is ${projectPython}`, { projectPython, requiresPython: dep.requiresPython });
}

module.exports = { id, run, weight };
