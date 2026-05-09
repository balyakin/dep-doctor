"use strict";

const { fail, pass, warn } = require("./result");

const id = "repo-mismatch";
const weight = 3;

const KNOWN_MISMATCH = {
  "event-stream": "repository changed during known compromise window"
};

function normalize(url) {
  return String(url || "")
    .trim()
    .replace(/^git\+/, "")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/^git@github.com:/, "https://github.com/")
    .replace(/^https?:\/\//, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function isRepositoryLikeSource(source) {
  return /(?:github\.com|gitlab\.com|bitbucket\.org|\.git(?:#|$))/i.test(String(source || ""));
}

function run(dep) {
  if (KNOWN_MISMATCH[dep.name]) return fail(id, weight, KNOWN_MISMATCH[dep.name], { knownIncident: true });
  const publishRepository = dep.publishRepository || (isRepositoryLikeSource(dep.source) ? dep.source : null);
  if (dep.repository && publishRepository) {
    const repo = normalize(dep.repository);
    const published = normalize(publishRepository);
    if (repo && published && repo !== published) {
      return fail(id, weight, "repository URL does not match publish source", { repository: dep.repository, publishRepository });
    }
  }
  if (!dep.repository && dep.metadataSource) return warn(id, weight, "no repository URL in package metadata");
  return pass(id, weight, dep.repository ? "repository URL present" : "repository metadata unavailable offline", { degraded: !dep.repository });
}

module.exports = { id, run, weight };
