'use strict';

const { run } = require('./exec');

let lastIostatSample = null;

/**
 * Collect disk space and I/O statistics.
 *
 * Space: `df -k /` for used/total/percent.
 * I/O: `iostat -c 2 disk0` — second sample gives tps and MB/s.
 *
 * @returns {Promise<{usedGB:number,totalGB:number,percent:number,tps:number,mbps:number}|null>}
 */
async function collect() {
  // Disk space from df -k /
  const dfOut = await run('df -k /');
  if (!dfOut) {
    return null;
  }

  const dfLines = dfOut.split('\n');
  let usedGB = 0, totalGB = 0, percent = 0;

  if (dfLines.length >= 2) {
    const parts = dfLines[1].trim().split(/\s+/);
    // Filesystem 1K-blocks Used Available Capacity Mounted on
    if (parts.length >= 5) {
      const usedKB = parseInt(parts[2], 10);
      const totalKB = parseInt(parts[1], 10);
      const capStr = parts[4].replace('%', '');
      usedGB = Math.round((usedKB / (1024 * 1024)) * 100) / 100;
      totalGB = Math.round((totalKB / (1024 * 1024)) * 100) / 100;
      percent = parseInt(capStr, 10);
    }
  }

  if (totalGB === 0) {
    return null;
  }

  // Disk I/O from iostat -c 2 disk0
  let tps = 0, mbps = 0;
  const iostatOut = await run('iostat -d -c 2 disk0', 15000);
  if (iostatOut) {
    const dataLines = iostatOut.split('\n').filter((l) => {
      const trimmed = l.trim();
      return trimmed && !trimmed.includes('disk0') && !trimmed.includes('KB/t') && !trimmed.includes('tty');
    });
    if (dataLines.length >= 2) {
      // Second sample row
      const parts = dataLines[dataLines.length - 1].trim().split(/\s+/);
      const nums = parts.map(parseFloat).filter((n) => !isNaN(n));
      // iostat disk columns: KB/t, tps, MB/s
      if (nums.length >= 3) {
        tps = Math.round(nums[1] * 10) / 10;
        mbps = Math.round(nums[2] * 100) / 100;
      }
    }
  }

  return {
    usedGB,
    totalGB,
    percent,
    tps,
    mbps
  };
}

module.exports = { collect };
