"use strict";

async function fetchRepositoryBatch() {
  return {
    degraded: true,
    reason: "GitHub GraphQL provider is disabled in offline mode",
    repositories: []
  };
}

module.exports = { fetchRepositoryBatch };
