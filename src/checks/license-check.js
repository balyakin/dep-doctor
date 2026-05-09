"use strict";

const { fail, pass, warn } = require("./result");

const id = "license-check";
const weight = 2;

const PERMISSIVE = ["MIT", "APACHE-2.0", "BSD", "BSD-2-CLAUSE", "BSD-3-CLAUSE", "ISC", "UNLICENSE", "0BSD"];
const COPYLEFT = ["GPL", "LGPL", "AGPL", "MPL", "EPL", "CDDL"];

function run(dep) {
  if (dep.private) return pass(id, weight, "private package");
  if (!dep.license) return fail(id, weight, "license unknown");
  const normalized = normalizeLicense(dep.license);
  const hasPermissive = PERMISSIVE.some((license) => normalized.includes(license));
  const hasCopyleft = COPYLEFT.some((license) => normalized.includes(license));
  if (hasCopyleft) return warn(id, weight, `${dep.license} copyleft license`);
  if (hasPermissive) return pass(id, weight, `${dep.license} license`);
  return fail(id, weight, `${dep.license} license is unknown policy`);
}

function normalizeLicense(license) {
  return String(license)
    .toUpperCase()
    .replace(/\bAPACHE\s*2\.0\b/g, "APACHE-2.0")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { id, normalizeLicense, run, weight };
