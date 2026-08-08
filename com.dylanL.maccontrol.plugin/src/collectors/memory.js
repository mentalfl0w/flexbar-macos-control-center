'use strict';

const { run } = require('./exec');

/**
 * Collect memory usage and pressure.
 *
 * Uses `vm_stat` to compute used = (active + wired + compressor) * page_size.
 * Page size is parsed from the first line of vm_stat output.
 * Memory pressure is read from `memory_pressure` (percentage).
 *
 * @returns {Promise<{usedBytes:number,totalBytes:number,usedPercent:number,pressure:number}|null>}
 */
async function collect() {
  const vmStatOut = await run('vm_stat');
  if (!vmStatOut) {
    return null;
  }

  // Parse page size from first line: "Mach Virtual Memory Statistics: (page size of 16384 bytes)"
  let pageSize = 16384;
  const psMatch = vmStatOut.match(/page size of (\d+) bytes/);
  if (psMatch) {
    pageSize = parseInt(psMatch[1], 10);
  }

  // Parse memory stats
  const lines = vmStatOut.split('\n');
  let active = 0, wired = 0, compressor = 0;
  let free = 0, inactive = 0, speculative = 0;

  for (const line of lines) {
    const m = line.match(/"?(.+?)"?:\s+([\d.]+)/);
    if (!m) continue;
    const key = m[1].trim();
    const val = parseInt(m[2].replace(/\./g, ''), 10);
    if (key === 'Pages active') active = val;
    else if (key === 'Pages wired down') wired = val;
    else if (key === 'Pages occupied by compressor') compressor = val;
    else if (key === 'Pages free') free = val;
    else if (key === 'Pages inactive') inactive = val;
    else if (key === 'Pages speculative') speculative = val;
  }

  // Get total memory (cached at system.js, but also available via sysctl)
  const memTotalOut = await run('sysctl -n hw.memsize');
  let totalBytes = 0;
  if (memTotalOut) {
    totalBytes = parseInt(memTotalOut, 10);
  }

  if (totalBytes === 0) {
    return null;
  }

  const usedBytes = (active + wired + compressor) * pageSize;
  const usedPercent = Math.round((usedBytes / totalBytes) * 1000) / 10;

  // Memory pressure from `memory_pressure` command
  let pressure = usedPercent;
  const pressureOut = await run('memory_pressure -Q', 5000);
  if (pressureOut) {
    // Output like: "System-wide memory free percentage: 42%"
    const pMatch = pressureOut.match(/free percentage:\s+(\d+)/);
    if (pMatch) {
      pressure = 100 - parseInt(pMatch[1], 10);
    }
  }

  return {
    usedBytes,
    totalBytes,
    usedPercent,
    pressure: Math.round(pressure * 10) / 10
  };
}

module.exports = { collect };
