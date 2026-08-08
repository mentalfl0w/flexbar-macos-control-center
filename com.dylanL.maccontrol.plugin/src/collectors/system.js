'use strict';

const { run } = require('./exec');

let cached = null;

/**
 * Collect system hardware information (cached after first call).
 *
 * Uses sysctl and system_profiler to gather chip model, core count,
 * total memory, and Mac model name.
 *
 * @returns {Promise<{chip:string,cores:number,memTotal:number,model:string}|null>}
 */
async function collect() {
  if (cached) {
    return cached;
  }

  let chip = 'Unknown';
  let cores = 0;
  let memTotal = 0;
  let model = 'Mac';

  // Chip model
  const brandOut = await run('sysctl -n machdep.cpu.brand_string');
  if (brandOut) {
    chip = brandOut;
  }

  // Try sysctl for Apple Silicon chip name
  const cpuInfoOut = await run('sysctl -n machdep.cpu.brand_string');
  if (cpuInfoOut) {
    chip = cpuInfoOut;
  }

  // Physical CPU cores
  const coresOut = await run('sysctl -n hw.physicalcpu');
  if (coresOut) {
    cores = parseInt(coresOut, 10);
  }

  // Total memory
  const memOut = await run('sysctl -n hw.memsize');
  if (memOut) {
    memTotal = parseInt(memOut, 10);
  }

  // Model name from system_profiler
  const profilerOut = await run('system_profiler SPHardwareDataType', 15000);
  if (profilerOut) {
    const modelMatch = profilerOut.match(/Model Name:\s*(.+)/);
    if (modelMatch) {
      model = modelMatch[1].trim();
    }
    const chipMatch = profilerOut.match(/Chip:\s*(.+)/);
    if (chipMatch) {
      chip = chipMatch[1].trim();
    }
    const coresMatch = profilerOut.match(/Total Number of Cores:\s*(\d+)/);
    if (coresMatch) {
      cores = parseInt(coresMatch[1], 10);
    }
    const memMatch = profilerOut.match(/Memory:\s*([\d.]+)\s*(\w+)/);
    if (memMatch) {
      const val = parseFloat(memMatch[1]);
      const unit = memMatch[2].toUpperCase();
      memTotal = unit === 'GB' ? val * 1024 * 1024 * 1024 : val * 1024 * 1024;
    }
  }

  cached = { chip, cores, memTotal, model };
  return cached;
}

module.exports = { collect };
