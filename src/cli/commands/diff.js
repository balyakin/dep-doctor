"use strict";

const fs = require("fs");
const path = require("path");
const { scan, shouldFail } = require("../../core/orchestrator");
const { parseArgs } = require("../../utils/cli-args");
const { formatScan } = require("../../utils/format");

async function run(argv) {
  const { args, flags } = parseArgs(argv);
  const target = path.resolve(process.cwd(), args[0] || ".");
  const scanResult = await scan(target, {
    baseline: true,
    workspaces: flags.workspaces === undefined ? undefined : flags.workspaces,
    skip: flags.skip,
    ignore: flags.ignore,
    config: flags.config,
    baselinePath: flags["baseline-path"],
    createBaseline: false
  });
  const format = flags.format || scanResult.config.format || "table";
  const output = formatScan(scanResult, { format, diffOnly: true });
  if (flags.output) {
    fs.writeFileSync(path.resolve(process.cwd(), flags.output), output, "utf8");
  } else {
    process.stdout.write(output);
  }
  const failOn = flags["fail-on"] || scanResult.config.failOn || "critical";
  return shouldFail(scanResult, failOn) ? 1 : 0;
}

module.exports = { run };
