"use strict";

const { fail, pass, warn } = require("./result");

const id = "go-proxy";
const weight = 3;

function run(dep) {
  if (dep.source) {
    if (String(dep.source).startsWith("local:")) return pass(id, weight, "local module replacement", { source: dep.source });
    if (dep.source === "direct") return warn(id, weight, "module source is direct", { source: dep.source });
    if (String(dep.source).includes("proxy.golang.org")) return pass(id, weight, "official Go proxy used", { source: dep.source });
    return fail(id, weight, "module source is not the official Go proxy", { source: dep.source });
  }
  return pass(id, weight, "module fetch source unavailable offline", { degraded: true });
}

module.exports = { id, run, weight };
