#!/usr/bin/env node
"use strict";

const scan = require("./commands/scan");
const diff = require("./commands/diff");
const init = require("./commands/init");
const check = require("./commands/check");
const fix = require("./commands/fix");
const { getVersion } = require("../utils/version");

const COMMANDS = { scan, diff, init, check, fix };

function assertNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) {
    throw new Error(`dep-doctor requires Node.js >=18. Current version is ${process.versions.node}.`);
  }
}

function help() {
  return `dep-doctor v${getVersion()}

Usage:
  dep-doctor scan [path] [--baseline] [--update-baseline] [--workspaces] [--format=table|json|markdown|sarif]
  dep-doctor diff [path] --baseline [--format=table|json|markdown|sarif]
  dep-doctor check <package@version> [--ecosystem=npm|python|cargo|go] [--verbose]
  dep-doctor fix [path] [--baseline] [--no-interactive]
  dep-doctor init [path] [--force]

Options:
  --fail-on=critical|warning|none
  --skip=check-a,check-b
  --ignore=package,@scope/*
  --baseline-path=.dep-doctor-baseline.json
  --ecosystem=npm|python|cargo|go
  --deps=dep-a,dep-b
  --no-interactive
  --output=report.json        scan/diff only
  --config=.dep-doctor.yml
`;
}

async function main(argv = process.argv.slice(2)) {
  assertNodeVersion();
  const first = argv[0];
  if (first === "--help" || first === "-h" || first === "help") {
    process.stdout.write(help());
    return 0;
  }
  if (first === "--version" || first === "-v") {
    process.stdout.write(`${getVersion()}\n`);
    return 0;
  }
  if (!first || first.startsWith("-")) return scan.run(argv);
  const command = COMMANDS[first];
  if (!command) {
    process.stderr.write(`Unknown command: ${first}\n\n${help()}`);
    return 2;
  }
  return command.run(argv.slice(1));
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    if (error.code === "ENOLOCK") {
      process.stderr.write(`${error.message}\n`);
    } else {
      process.stderr.write(`dep-doctor: ${error.message}\n`);
      if (process.env.DEBUG) process.stderr.write(`${error.stack}\n`);
    }
    process.exitCode = 1;
  });
}

module.exports = { assertNodeVersion, help, main };
