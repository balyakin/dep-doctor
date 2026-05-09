"use strict";

const fs = require("fs");
const path = require("path");

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function dirExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function readJson(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    const position = String(error.message).match(/position\s+(\d+)/);
    const token = String(error.message).match(/Unexpected token '([^']+)'/);
    const fallbackIndex = token ? text.indexOf(token[1]) : (String(error.message).includes("Unexpected end") ? text.length : -1);
    if (position) {
      const index = Number(position[1]);
      const before = text.slice(0, index);
      const line = before.split(/\r?\n/).length;
      const column = before.length - before.lastIndexOf("\n");
      error.message = `${filePath}:${line}:${column}: ${error.message}`;
    } else if (fallbackIndex >= 0) {
      const before = text.slice(0, fallbackIndex);
      const line = before.split(/\r?\n/).length;
      const column = before.length - before.lastIndexOf("\n");
      error.message = `${filePath}:${line}:${column}: ${error.message}`;
    } else {
      error.message = `${filePath}: ${error.message}`;
    }
    throw error;
  }
}

function safeReadJson(filePath) {
  if (!fileExists(filePath)) return null;
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function safeReadText(filePath) {
  if (!fileExists(filePath)) return null;
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function findUp(startDir, names) {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;
  const wanted = Array.isArray(names) ? names : [names];
  while (true) {
    for (const name of wanted) {
      const candidate = path.join(current, name);
      if (fileExists(candidate)) return candidate;
    }
    if (current === root) return null;
    current = path.dirname(current);
  }
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

module.exports = {
  dirExists,
  fileExists,
  findUp,
  readJson,
  safeReadJson,
  safeReadText,
  uniqueBy
};
