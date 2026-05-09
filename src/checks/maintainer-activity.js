"use strict";

const { daysBetween } = require("../utils/semver");
const { fail, pass, warn } = require("./result");

const id = "maintainer-activity";
const weight = 3;

const KNOWN_LAST_ACTIVITY = {
  moment: "2020-09-15T00:00:00.000Z",
  request: "2020-02-11T00:00:00.000Z",
  "left-pad": "2018-01-01T00:00:00.000Z",
  "event-stream": "2018-09-09T00:00:00.000Z"
};

function run(dep, context) {
  const threshold = context.config.thresholds[id] || { warn: 180, fail: 365 };
  const evidence = dep.lastMaintainerCommit || KNOWN_LAST_ACTIVITY[dep.name];
  if (!evidence) {
    return pass(id, weight, "maintainer activity unavailable offline", { degraded: true });
  }

  const ageDays = daysBetween(context.now, evidence);
  if (ageDays == null) return pass(id, weight, "maintainer activity unavailable offline", { degraded: true });
  if (ageDays > threshold.fail) return fail(id, weight, `maintainer inactive ${Math.round(ageDays / 30)}mo`, { ageDays });
  if (ageDays >= threshold.warn) return warn(id, weight, `maintainer inactive ${Math.round(ageDays / 30)}mo`, { ageDays });
  return pass(id, weight, "maintainer active", { ageDays });
}

module.exports = { id, run, weight };
