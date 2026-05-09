"use strict";

const { daysBetween, isPrerelease } = require("../utils/semver");
const { fail, pass, warn } = require("./result");

const id = "version-freshness";
const weight = 4;

function run(dep, context) {
  const threshold = context.config.thresholds[id] || { warn: 7, fail: 3 };
  if (isPrerelease(dep.version)) {
    return warn(id, weight, "pre-release version installed", { version: dep.version });
  }
  if (!dep.publishedAt) {
    return pass(id, weight, "publish date unavailable offline", { degraded: true });
  }
  const ageDays = daysBetween(context.now, dep.publishedAt);
  if (ageDays == null) return pass(id, weight, "publish date unavailable offline", { degraded: true });
  if (ageDays < threshold.fail) return fail(id, weight, `published ${ageDays}d ago`, { ageDays });
  if (ageDays <= threshold.warn) return warn(id, weight, `published ${ageDays}d ago`, { ageDays });
  return pass(id, weight, "release cooldown passed", { ageDays });
}

module.exports = { id, run, weight };
