'use strict';

const { exec } = require('child_process');

/**
 * Run a shell command and return stdout (trimmed), or null on failure.
 * @param {string} cmd
 * @param {number} timeout - milliseconds
 * @returns {Promise<string|null>}
 */
function run(cmd, timeout = 10000) {
  return new Promise((resolve) => {
    exec(cmd, { timeout }, (err, stdout) => {
      if (err) {
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

module.exports = { run };
