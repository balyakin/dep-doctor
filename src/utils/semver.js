"use strict";

function coerceVersion(value) {
  if (value == null) return null;
  const match = String(value).trim().match(/v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [
    Number(match[1] || 0),
    Number(match[2] || 0),
    Number(match[3] || 0)
  ];
}

function compareVersions(a, b) {
  const av = coerceVersion(a);
  const bv = coerceVersion(b);
  if (!av || !bv) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (av[i] > bv[i]) return 1;
    if (av[i] < bv[i]) return -1;
  }
  return 0;
}

function isPrerelease(version) {
  return /-\w/.test(String(version || ""));
}

function bumpUpperBound(base, kind) {
  const v = coerceVersion(base);
  if (!v) return null;
  if (kind === "caret") {
    if (v[0] > 0) return `${v[0] + 1}.0.0`;
    if (v[1] > 0) return `0.${v[1] + 1}.0`;
    return `0.0.${v[2] + 1}`;
  }
  if (kind === "tilde") return `${v[0]}.${v[1] + 1}.0`;
  return null;
}

function testComparator(version, comparator) {
  const text = comparator.trim();
  if (!text || text === "*" || text.toLowerCase() === "x") return true;
  const hyphen = text.match(/^(.+)\s+-\s+(.+)$/);
  if (hyphen) {
    return compareVersions(version, hyphen[1]) >= 0 && compareVersions(version, hyphen[2]) <= 0;
  }
  if (text.startsWith("^")) {
    const base = text.slice(1);
    const upper = bumpUpperBound(base, "caret");
    return compareVersions(version, base) >= 0 && (!upper || compareVersions(version, upper) < 0);
  }
  if (text.startsWith("~")) {
    const base = text.slice(1);
    const upper = bumpUpperBound(base, "tilde");
    return compareVersions(version, base) >= 0 && (!upper || compareVersions(version, upper) < 0);
  }
  const match = text.match(/^(<=|>=|<|>|=|==)?\s*v?([0-9][0-9A-Za-z.+-]*)$/);
  if (!match) return true;
  const op = match[1] || "=";
  const target = match[2];
  const cmp = compareVersions(version, target);
  if (op === "<") return cmp < 0;
  if (op === "<=") return cmp <= 0;
  if (op === ">") return cmp > 0;
  if (op === ">=") return cmp >= 0;
  return cmp === 0;
}

function splitRange(range) {
  return String(range || "")
    .replace(/\|\|/g, " || ")
    .split(/\s+(?=(?:<|>|=|\^|~|v?\d))/)
    .flatMap((part) => part.split(","))
    .map((part) => part.trim())
    .filter(Boolean);
}

function satisfiesRange(version, range) {
  if (!range || range === "*" || range.toLowerCase() === "latest") return true;
  const alternatives = String(range)
    .split("||")
    .map((part) => splitRange(part))
    .filter((parts) => parts.length > 0);
  if (alternatives.length === 0) return true;
  return alternatives.some((comparators) => comparators.every((part) => testComparator(version, part)));
}

function daysBetween(now, then) {
  const end = now instanceof Date ? now : new Date(now);
  const start = then instanceof Date ? then : new Date(then);
  const diff = end.getTime() - start.getTime();
  if (!Number.isFinite(diff)) return null;
  return Math.floor(diff / 86400000);
}

function versionMatches(version, range) {
  if (!version || !range) return false;
  return satisfiesRange(version, range);
}

module.exports = {
  coerceVersion,
  compareVersions,
  daysBetween,
  isPrerelease,
  satisfiesRange,
  versionMatches
};
