"use strict";

function parseArgs(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--") {
      args.push(...argv.slice(i + 1));
      break;
    }
    if (!item.startsWith("-")) {
      args.push(item);
      continue;
    }
    if (item.startsWith("--no-")) {
      flags[item.slice(5)] = false;
      continue;
    }
    if (item.startsWith("--")) {
      const eq = item.indexOf("=");
      if (eq !== -1) {
        flags[item.slice(2, eq)] = item.slice(eq + 1);
      } else {
        const key = item.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith("-")) {
          flags[key] = next;
          i += 1;
        } else {
          flags[key] = true;
        }
      }
      continue;
    }
    const shorts = item.slice(1).split("");
    if (shorts.length === 1 && argv[i + 1] && !argv[i + 1].startsWith("-")) {
      flags[shorts[0]] = argv[i + 1];
      i += 1;
    } else {
      for (const short of shorts) flags[short] = true;
    }
  }
  return { args, flags };
}

function csv(value) {
  if (Array.isArray(value)) return value;
  if (!value || value === true || value === false) return [];
  if (String(value).trim() === "true" || String(value).trim() === "false") return [];
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

module.exports = { csv, parseArgs };
