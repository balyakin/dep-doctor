"use strict";

const COLORS = {
  green: "\u001b[38;2;34;197;94m",
  yellow: "\u001b[38;2;234;179;8m",
  red: "\u001b[38;2;239;68;68m",
  cyan: "\u001b[38;2;6;182;212m",
  dim: "\u001b[38;2;107;114;128m",
  bold: "\u001b[1m",
  reset: "\u001b[0m"
};

function supportsColor() {
  return Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
}

function color(name, value, enabled = supportsColor()) {
  if (!enabled || !COLORS[name]) return String(value);
  return `${COLORS[name]}${value}${COLORS.reset}`;
}

function stripAnsi(value) {
  return String(value).replace(/\u001b\[[0-9;]*m/g, "");
}

function createLogger({ silent = false, color: useColor = supportsColor() } = {}) {
  return {
    color: (name, value) => color(name, value, useColor),
    info: (...args) => {
      if (!silent) console.log(...args);
    },
    warn: (...args) => {
      if (!silent) console.warn(...args);
    },
    error: (...args) => {
      if (!silent) console.error(...args);
    }
  };
}

module.exports = { COLORS, color, createLogger, stripAnsi, supportsColor };
