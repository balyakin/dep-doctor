"use strict";

const { vulnerabilityResult } = require("./known-vulns");

const id = "govulncheck";
const weight = 5;

function run(dep) {
  return vulnerabilityResult(id, weight, dep, "go");
}

module.exports = { id, run, weight };
