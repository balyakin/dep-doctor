"use strict";

const { levenshtein } = require("../utils/levenshtein");
const { fail, pass, warn } = require("./result");

const id = "typosquatting";
const weight = 4;

const POPULAR_PACKAGES = [
  "react",
  "vue",
  "angular",
  "express",
  "lodash",
  "axios",
  "moment",
  "zod",
  "typescript",
  "webpack",
  "vite",
  "eslint",
  "prettier",
  "jest",
  "next",
  "redux",
  "commander",
  "chalk",
  "debug",
  "glob",
  "requests",
  "django",
  "flask",
  "numpy",
  "pandas",
  "serde",
  "tokio",
  "anyhow",
  "clap",
  "golang.org/x/crypto"
];

const KNOWN_DOWNLOADS = {
  react: 25000000,
  express: 30000000,
  lodash: 50000000,
  axios: 45000000,
  moment: 12000000,
  zod: 10000000,
  glob: 90000000
};

function comparableNames(name) {
  const lower = String(name || "").toLowerCase();
  const names = [lower];
  if (lower.startsWith("@") && lower.includes("/")) names.push(lower.split("/").pop());
  return names;
}

function run(dep) {
  const names = comparableNames(dep.name);
  if (POPULAR_PACKAGES.includes(dep.name.toLowerCase())) return pass(id, weight, "not similar to another popular package");
  let closest = null;
  for (const name of names) {
    for (const popular of POPULAR_PACKAGES) {
      if (name === popular) continue;
      if (Math.abs(name.length - popular.length) > 2) continue;
      const distance = levenshtein(name, popular);
      if (!closest || distance < closest.distance) closest = { popular, distance };
    }
  }
  if (!closest || closest.distance > 2) return pass(id, weight, "not similar to top package names");
  const hasDownloadEvidence = dep.weeklyDownloads != null || KNOWN_DOWNLOADS[dep.name] != null;
  const weeklyDownloads = dep.weeklyDownloads ?? KNOWN_DOWNLOADS[dep.name] ?? null;
  if (closest.distance === 1 && hasDownloadEvidence && weeklyDownloads < 1000) {
    return fail(id, weight, `name is 1 edit from ${closest.popular}`, { closest, weeklyDownloads });
  }
  return warn(id, weight, `name is ${closest.distance} edits from ${closest.popular}`, {
    closest,
    weeklyDownloads,
    degraded: !hasDownloadEvidence
  });
}

module.exports = { id, run, weight };
