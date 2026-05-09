"use strict";

function createRateLimiter({ intervalMs = 1000, max = 1 } = {}) {
  const queue = [];
  const timestamps = [];
  let running = false;

  function drain() {
    if (running || queue.length === 0) return;
    const now = Date.now();
    while (timestamps.length && now - timestamps[0] >= intervalMs) timestamps.shift();
    if (timestamps.length >= max) {
      const delay = Math.max(0, intervalMs - (now - timestamps[0]));
      setTimeout(drain, delay);
      return;
    }
    const item = queue.shift();
    timestamps.push(now);
    running = true;
    Promise.resolve()
      .then(item.fn)
      .then(item.resolve, item.reject)
      .finally(() => {
        running = false;
        drain();
      });
  }

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      drain();
    });
  };
}

module.exports = { createRateLimiter };
