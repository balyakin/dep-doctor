"use strict";

const path = require("path");
const { parseArgs } = require("../../utils/cli-args");
const { writeDefaultConfig } = require("../../utils/config");

async function run(argv) {
  const { args, flags } = parseArgs(argv);
  const target = path.resolve(process.cwd(), args[0] || ".");
  const configPath = writeDefaultConfig(target, { force: Boolean(flags.force) });
  process.stdout.write(`Created ${path.relative(process.cwd(), configPath) || ".dep-doctor.yml"}\n`);
  return 0;
}

module.exports = { run };
