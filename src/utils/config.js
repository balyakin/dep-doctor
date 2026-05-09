"use strict";

const fs = require("fs");
const path = require("path");
const { findUp, fileExists } = require("./fs");

const DEFAULT_CONFIG = {
  format: "table",
  failOn: "critical",
  workspaces: "auto",
  skip: [],
  ignore: [],
  thresholds: {
    "maintainer-activity": { warn: 180, fail: 365 },
    "version-freshness": { warn: 7, fail: 3 }
  },
  baseline: {
    path: ".dep-doctor-baseline.json",
    autoUpdate: false
  },
  plugins: []
};

function parseScalar(value) {
  const trimmed = String(value || "").trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((part) => parseScalar(part))
      .filter((part) => part !== "");
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const obj = {};
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return obj;
    for (const part of inner.split(",")) {
      const [key, ...rest] = part.split(":");
      if (!key || rest.length === 0) continue;
      obj[key.trim()] = parseScalar(rest.join(":"));
    }
    return obj;
  }
  return trimmed;
}

function setNested(target, pathParts, value) {
  let current = target;
  for (let i = 0; i < pathParts.length - 1; i += 1) {
    const key = pathParts[i];
    if (!current[key] || typeof current[key] !== "object" || Array.isArray(current[key])) current[key] = {};
    current = current[key];
  }
  current[pathParts[pathParts.length - 1]] = value;
}

function parseSimpleYaml(text) {
  const root = {};
  const stack = [{ indent: -1, path: [] }];
  const lines = String(text || "").split(/\r?\n/);

  for (const rawLine of lines) {
    const withoutComment = rawLine.replace(/\s+#.*$/, "");
    if (!withoutComment.trim()) continue;
    const indent = withoutComment.match(/^\s*/)[0].length;
    const trimmed = withoutComment.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parentPath = stack[stack.length - 1].path;

    if (trimmed.startsWith("- ")) {
      const key = parentPath[parentPath.length - 1];
      const containerPath = parentPath.slice(0, -1);
      let container = root;
      for (const part of containerPath) container = container[part];
      if (!Array.isArray(container[key])) container[key] = [];
      container[key].push(parseScalar(trimmed.slice(2)));
      continue;
    }

    const match = trimmed.match(/^([^:]+):(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim();
    const currentPath = parentPath.concat(key);
    if (value === "") {
      setNested(root, currentPath, {});
      stack.push({ indent, path: currentPath });
    } else {
      setNested(root, currentPath, parseScalar(value));
    }
  }

  return root;
}

function normalizeConfig(raw = {}) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  if (raw.format) merged.format = raw.format;
  if (raw["fail-on"]) merged.failOn = raw["fail-on"];
  if (raw.failOn) merged.failOn = raw.failOn;
  if (raw.workspaces !== undefined) merged.workspaces = raw.workspaces;
  if (Array.isArray(raw.skip)) merged.skip = raw.skip;
  if (Array.isArray(raw.ignore)) merged.ignore = raw.ignore;
  if (Array.isArray(raw.plugins)) merged.plugins = raw.plugins;
  if (raw.thresholds && typeof raw.thresholds === "object") {
    merged.thresholds = { ...merged.thresholds, ...raw.thresholds };
  }
  if (raw.baseline && typeof raw.baseline === "object") {
    merged.baseline = {
      ...merged.baseline,
      ...raw.baseline,
      autoUpdate: raw.baseline["auto-update"] ?? raw.baseline.autoUpdate ?? merged.baseline.autoUpdate
    };
  }
  validateConfig(merged);
  return merged;
}

function validateConfig(config) {
  const formats = new Set(["table", "json", "markdown", "sarif"]);
  const failOn = new Set(["critical", "warning", "none"]);
  const workspaceModes = new Set(["auto", "true", "false", "none", "recursive", true, false]);
  if (!formats.has(config.format)) throw new Error(`Invalid dep-doctor config: format must be table, json, markdown, or sarif`);
  if (!failOn.has(config.failOn)) throw new Error(`Invalid dep-doctor config: fail-on must be critical, warning, or none`);
  if (!workspaceModes.has(config.workspaces)) throw new Error(`Invalid dep-doctor config: workspaces must be auto, true, false, none, or recursive`);
  if (!Array.isArray(config.skip)) throw new Error("Invalid dep-doctor config: skip must be a list");
  if (!Array.isArray(config.ignore)) throw new Error("Invalid dep-doctor config: ignore must be a list");
  if (Array.isArray(config.plugins) && config.plugins.length > 0) {
    throw new Error("Invalid dep-doctor config: plugins are not supported in this MVP");
  }
  for (const [check, threshold] of Object.entries(config.thresholds || {})) {
    if (!threshold || typeof threshold !== "object") throw new Error(`Invalid dep-doctor config: thresholds.${check} must be an object`);
    for (const key of ["warn", "fail"]) {
      if (threshold[key] != null && (!Number.isFinite(Number(threshold[key])) || Number(threshold[key]) < 0)) {
        throw new Error(`Invalid dep-doctor config: thresholds.${check}.${key} must be a non-negative number`);
      }
    }
  }
  return config;
}

function loadConfig(projectRoot, explicitPath) {
  const configPath = explicitPath
    ? path.resolve(projectRoot, explicitPath)
    : findUp(projectRoot, [".dep-doctor.yml", ".dep-doctor.yaml", ".dep-doctor.json"]);
  if (!configPath || !fileExists(configPath)) return { config: normalizeConfig(), path: null };

  const text = fs.readFileSync(configPath, "utf8");
  const raw = configPath.endsWith(".json") ? JSON.parse(text) : parseSimpleYaml(text);
  return { config: normalizeConfig(raw), path: configPath };
}

function writeDefaultConfig(projectRoot, options = {}) {
  const target = path.join(projectRoot, ".dep-doctor.yml");
  if (fileExists(target) && !options.force) {
    const error = new Error(`${target} already exists`);
    error.code = "EEXIST";
    throw error;
  }
  const content = `format: table
fail-on: critical
workspaces: auto

skip: []

ignore:
  - internal-private-package
  - "@company/*"

thresholds:
  maintainer-activity: { warn: 180, fail: 365 }
  version-freshness: { warn: 7, fail: 3 }

baseline:
  path: .dep-doctor-baseline.json
  auto-update: false
`;
  fs.writeFileSync(target, content, "utf8");
  return target;
}

module.exports = {
  DEFAULT_CONFIG,
  loadConfig,
  normalizeConfig,
  parseSimpleYaml,
  validateConfig,
  writeDefaultConfig
};
