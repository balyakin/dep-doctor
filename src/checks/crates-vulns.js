"use strict";

const { vulnerabilityResult } = require("./known-vulns");

const id = "crates-vulns";
const weight = 5;

function run(dep) {
  return vulnerabilityResult(id, weight, dep, "cargo");
}

module.exports = { id, run, weight };
