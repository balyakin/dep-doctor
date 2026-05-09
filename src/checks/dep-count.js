"use strict";

const { fail, pass, warn } = require("./result");

const id = "dep-count";
const weight = 1;

function run(dep) {
  const count = Number(dep.transitiveCount || 0);
  if (count > 50) return fail(id, weight, `${count} transitive dependencies`, { transitiveCount: count });
  if (count >= 10) return warn(id, weight, `${count} transitive dependencies`, { transitiveCount: count });
  return pass(id, weight, `${count} transitive dependencies`, { transitiveCount: count });
}

module.exports = { id, run, weight };
