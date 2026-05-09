"use strict";

const { vulnerabilityResult } = require("./known-vulns");

const id = "pip-audit";
const weight = 5;

function run(dep) {
  return vulnerabilityResult(id, weight, dep, "python");
}

module.exports = { id, run, weight };
