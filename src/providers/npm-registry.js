"use strict";

async function fetchPackageMetadata() {
  return {
    degraded: true,
    reason: "npm registry provider is disabled in offline mode",
    metadata: null
  };
}

module.exports = { fetchPackageMetadata };
