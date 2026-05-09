"use strict";

const { daysBetween } = require("../utils/semver");
const { fail, pass, warn } = require("./result");

const id = "new-maintainers";
const weight = 5;

const KNOWN_RISKY_MAINTAINERS = {
  "event-stream": { status: "fail", message: "new maintainer with known supply-chain takeover history" }
};

function run(dep, context) {
  const known = KNOWN_RISKY_MAINTAINERS[dep.name];
  if (known) return fail(id, weight, known.message, { knownIncident: true });

  const maintainers = Array.isArray(dep.maintainers) ? dep.maintainers : [];
  const newMaintainers = maintainers.filter((maintainer) => {
    if (!maintainer.addedAt) return false;
    const addedAge = daysBetween(context.now, maintainer.addedAt);
    return addedAge != null && addedAge < 90;
  });
  if (newMaintainers.some((maintainer) => maintainer.createdAt && daysBetween(context.now, maintainer.createdAt) < 90)) {
    return fail(id, weight, "new maintainer account <90d old", { maintainers: newMaintainers });
  }
  if (newMaintainers.some((maintainer) => maintainer.createdAt && daysBetween(context.now, maintainer.createdAt) < 365)) {
    return warn(id, weight, "new maintainer added in last 90d", { maintainers: newMaintainers });
  }
  if (newMaintainers.some((maintainer) => !maintainer.createdAt)) {
    return warn(id, weight, "new maintainer account age unavailable offline", { degraded: true, maintainers: newMaintainers });
  }
  return pass(id, weight, "no suspicious new maintainers found");
}

module.exports = { id, run, weight };
