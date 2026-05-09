"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

function cacheDir() {
  return process.env.DEP_DOCTOR_CACHE || path.join(os.homedir(), ".cache", "dep-doctor");
}

function cachePath(namespace) {
  return path.join(cacheDir(), `${namespace}.json`);
}

const TTL = {
  popular: 7 * 24 * 60 * 60 * 1000,
  unknown: 24 * 60 * 60 * 1000,
  cve: 60 * 60 * 1000
};

function ttlFor(namespace, options = {}) {
  if (options.ttlMs != null) return options.ttlMs;
  if (String(namespace).includes("cve") || String(namespace).includes("vuln") || String(namespace).includes("osv")) return TTL.cve;
  if (options.popular) return TTL.popular;
  return TTL.unknown;
}

function readCache(namespace, options = {}) {
  try {
    const payload = JSON.parse(fs.readFileSync(cachePath(namespace), "utf8"));
    if (!payload || typeof payload !== "object" || !payload.__meta) return payload || {};
    const age = Date.now() - Date.parse(payload.__meta.updatedAt || 0);
    if (!Number.isFinite(age) || age > ttlFor(namespace, options)) return {};
    return payload.data || {};
  } catch {
    return {};
  }
}

function writeCache(namespace, data) {
  fs.mkdirSync(cacheDir(), { recursive: true });
  fs.writeFileSync(cachePath(namespace), JSON.stringify({
    __meta: {
      updatedAt: new Date().toISOString()
    },
    data
  }, null, 2), "utf8");
}

module.exports = { TTL, cacheDir, readCache, ttlFor, writeCache };
