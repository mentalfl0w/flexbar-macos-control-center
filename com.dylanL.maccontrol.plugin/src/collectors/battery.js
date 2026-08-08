'use strict';

const { run } = require('./exec');

/**
 * Collect battery / power source information.
 *
 * Uses `ioreg -rc AppleSmartBattery` to detect battery and read capacity.
 * Falls back to AC-only status for desktop Macs (Mac mini, Mac Studio, etc.).
 * Uses `pmset -g batt` to determine charging state.
 *
 * @returns {Promise<object|null>} Battery info or {hasBattery:false, ac:true}
 */
async function collect() {
  const ioregOut = await run('ioreg -rc AppleSmartBattery');
  const hasBattery = ioregOut && ioregOut.includes('AppleSmartBattery');

  if (!hasBattery) {
    // Desktop Mac — AC power
    return { hasBattery: false, ac: true, percent: 100, charging: true };
  }

  let currentCapacity = 0;
  let maxCapacity = 0;
  let designCapacity = 0;
  let cycleCount = 0;

  for (const line of ioregOut.split('\n')) {
    const curMatch = line.match(/"CurrentCapacity"\s*=\s*(\d+)/);
    if (curMatch) currentCapacity = parseInt(curMatch[1], 10);

    const maxMatch = line.match(/"MaxCapacity"\s*=\s*(\d+)/);
    if (maxMatch) maxCapacity = parseInt(maxMatch[1], 10);

    const designMatch = line.match(/"DesignCapacity"\s*=\s*(\d+)/);
    if (designMatch) designCapacity = parseInt(designMatch[1], 10);

    const cycleMatch = line.match(/"CycleCount"\s*=\s*(\d+)/);
    if (cycleMatch) cycleCount = parseInt(cycleMatch[1], 10);
  }

  // Mac mini / Mac Studio report a dummy AppleSmartBattery with 0 capacity —
  // treat zero-capacity as "no battery" (desktop, AC only).
  if (maxCapacity === 0 && currentCapacity === 0) {
    return { hasBattery: false, ac: true, percent: 100, charging: true };
  }

  const percent = maxCapacity > 0
    ? Math.round((currentCapacity / maxCapacity) * 100)
    : 0;

  // Charging state from pmset -g batt
  let charging = false;
  const pmsetOut = await run('pmset -g batt');
  if (pmsetOut) {
    // "AC Power" or "Battery Power" on first data line
    charging = pmsetOut.includes('AC Power') && !pmsetOut.includes('Battery Power');
  }

  return {
    hasBattery: true,
    ac: charging,
    percent,
    charging,
    currentCapacity,
    maxCapacity,
    designCapacity,
    cycleCount
  };
}

module.exports = { collect };
