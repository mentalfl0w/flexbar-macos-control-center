'use strict';

const { run } = require('./exec');

/**
 * Collect CPU usage and load averages.
 *
 * Strategy:
 * 1. `top -l 2 -n 0` — parse the second "CPU usage" line for user + sys.
 * 2. Fallback: `iostat -c 2 disk0` — parse %us + %sy from second sample.
 * 3. Load averages from `uptime`.
 *
 * @returns {Promise<{usage:number,load1:number,load5:number,load15:number}|null>}
 */
async function collect() {
  let usage = null;

  // Primary: top -l 2 (takes ~1s for two samples)
  const topOut = await run('top -l 2 -n 0', 15000);
  if (topOut) {
    // Find all "CPU usage:" lines and take the last one
    const lines = topOut.split('\n').filter((l) => l.includes('CPU usage:'));
    if (lines.length >= 2) {
      const line = lines[lines.length - 1];
      // "CPU usage: 12.5% user, 6.25% sys, 81.25% idle"
      const userMatch = line.match(/([\d.]+)%\s+user/);
      const sysMatch = line.match(/([\d.]+)%\s+sys/);
      if (userMatch && sysMatch) {
        usage = parseFloat(userMatch[1]) + parseFloat(sysMatch[1]);
      }
    }
  }

  // Fallback: iostat -c 2 disk0
  if (usage === null) {
    const iostatOut = await run('iostat -c 2 disk0', 15000);
    if (iostatOut) {
      const dataLines = iostatOut.split('\n').filter((l) => l.trim() && !l.includes('cpu') && !l.includes('KB/t'));
      if (dataLines.length >= 2) {
        const parts = dataLines[dataLines.length - 1].trim().split(/\s+/);
        // iostat columns: KB/t tps MB/s %us %sy %id — find numeric us/sy
        const nums = parts.map(parseFloat).filter((n) => !isNaN(n));
        // us and sy are typically positions 3 and 4 if 6 columns
        if (nums.length >= 6) {
          usage = nums[3] + nums[4];
        }
      }
    }
  }

  // Load averages from uptime
  let load1 = 0, load5 = 0, load15 = 0;
  const uptimeOut = await run('uptime');
  if (uptimeOut) {
    // "load averages: 2.10 1.92 1.83" or "load average: 2.10, 1.92, 1.83"
    const match = uptimeOut.match(/load average[s]?:\s+([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
    if (match) {
      load1 = parseFloat(match[1]);
      load5 = parseFloat(match[2]);
      load15 = parseFloat(match[3]);
    }
  }

  if (usage === null) {
    return null;
  }

  return {
    usage: Math.round(usage * 10) / 10,
    load1: Math.round(load1 * 100) / 100,
    load5: Math.round(load5 * 100) / 100,
    load15: Math.round(load15 * 100) / 100
  };
}

module.exports = { collect };
