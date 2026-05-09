"use strict";

const { findAdvisories } = require("./advisory-db");

async function queryBatch(packages) {
  return packages.map((pkg) => ({
    package: pkg,
    advisories: findAdvisories(pkg.ecosystem, pkg.name, pkg.version)
  }));
}

module.exports = { queryBatch };
