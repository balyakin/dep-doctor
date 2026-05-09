"use strict";

const { compareVersions } = require("../utils/semver");
const { fail, pass, warn } = require("./result");

const id = "msrv-check";
const weight = 2;

function run(dep) {
  const projectRust = dep.project && dep.project.rustVersion;
  const crateRust = dep.rustVersion;
  if (!projectRust || !crateRust) return pass(id, weight, "MSRV compatibility unavailable offline", { degraded: true });
  const cmp = compareVersions(crateRust, projectRust);
  if (cmp <= 0) return pass(id, weight, "MSRV compatible", { projectRust, crateRust });
  const projectMinor = Number(String(projectRust).split(".")[1] || 0);
  const crateMinor = Number(String(crateRust).split(".")[1] || 0);
  if (String(projectRust).split(".")[0] === String(crateRust).split(".")[0] && crateMinor - projectMinor <= 1) {
    return warn(id, weight, `crate MSRV ${crateRust} is newer than project ${projectRust}`, { projectRust, crateRust });
  }
  return fail(id, weight, `crate MSRV ${crateRust} is newer than project ${projectRust}`, { projectRust, crateRust });
}

module.exports = { id, run, weight };
