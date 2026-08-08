'use strict';

const { run } = require('./exec');

let lastSample = { bytesIn: 0, bytesOut: 0, time: 0 };

function parseBytes(num, unit) {
  const n = parseFloat(num) || 0;
  switch ((unit || '').toUpperCase()) {
    case 'K': return n * 1024;
    case 'M': return n * 1024 * 1024;
    case 'G': return n * 1024 * 1024 * 1024;
    case 'T': return n * 1024 * 1024 * 1024 * 1024;
    default: return n;
  }
}

/**
 * Collect network throughput (download/upload bytes/sec).
 *
 * Uses `/usr/bin/top -l 2` — its "Networks:" summary line carries cumulative
 * bytes since boot. Rate = delta between consecutive samples / elapsed time.
 * (netstat -ib hangs on some macOS 26/27 builds, so we avoid it.)
 *
 * @returns {Promise<{downBps:number,upBps:number}|null>}
 */
async function collect() {
  const out = await run('/usr/bin/top -l 2 -n 0');
  if (!out) return null;

  // Take the LAST Networks line (second snapshot = current cumulative totals)
  const lines = out.split('\n').filter((l) => l.includes('Networks:'));
  if (!lines.length) return null;
  const netLine = lines[lines.length - 1];

  // Format: Networks: packets: 66029726/5299M in, 147148977/274G out.
  const m = netLine.match(/packets:\s*\d+\/([\d.]+)([KMGT]?)\s+in,\s*\d+\/([\d.]+)([KMGT]?)\s+out/i);
  if (!m) return null;

  const totalIn = parseBytes(m[1], m[2]);
  const totalOut = parseBytes(m[3], m[4]);

  const now = Date.now();
  let downBps = 0;
  let upBps = 0;

  if (lastSample.time > 0) {
    const dt = (now - lastSample.time) / 1000;
    if (dt > 0) {
      downBps = Math.max(0, Math.round((totalIn - lastSample.bytesIn) / dt));
      upBps = Math.max(0, Math.round((totalOut - lastSample.bytesOut) / dt));
    }
  }

  lastSample = { bytesIn: totalIn, bytesOut: totalOut, time: now };
  return { downBps, upBps };
}

module.exports = { collect };
