"use strict";

const { readFileSync } = require("fs");
const path = require("path");

function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

module.exports = { getVersion };
