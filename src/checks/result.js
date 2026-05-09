"use strict";

function checkResult(id, status, weight, message, details = {}) {
  return {
    id,
    status,
    weight,
    message,
    details
  };
}

function pass(id, weight, message, details) {
  return checkResult(id, "pass", weight, message, details);
}

function warn(id, weight, message, details) {
  return checkResult(id, "warn", weight, message, details);
}

function fail(id, weight, message, details) {
  return checkResult(id, "fail", weight, message, details);
}

module.exports = { checkResult, fail, pass, warn };
