'use strict';

const { spawn } = require('child_process');

/**
 * Collect network throughput (download/upload bytes/sec).
 *
 * Uses `netstat -w 1` which emits a line every second with the real-time byte
 * rate. (netstat -ib hangs on some macOS builds, and /usr/bin/top's Networks
 * totals are rounded to K/M/G — both unusable for short-window rates.)
 *
 * @returns {Promise<{downBps:number,upBps:number}|null>}
 */
function collect() {
  return new Promise((resolve) => {
    const child = spawn('netstat', ['-w', '1']);
    let buf = '';
    let done = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      try { child.kill(); } catch (_) {}
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), 5000);

    child.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      for (const l of lines) {
        const trimmed = l.trim();
        // Data row: "<pkts> <errs> <bytes> <pkts> <errs> <bytes> <colls>"
        if (/^\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+/.test(trimmed)) {
          const parts = trimmed.split(/\s+/);
          const downBps = parseInt(parts[2], 10) || 0;
          const upBps = parseInt(parts[5], 10) || 0;
          clearTimeout(timer);
          finish({ downBps, upBps });
          return;
        }
      }
    });

    child.on('error', () => {
      clearTimeout(timer);
      finish(null);
    });
  });
}

module.exports = { collect };
