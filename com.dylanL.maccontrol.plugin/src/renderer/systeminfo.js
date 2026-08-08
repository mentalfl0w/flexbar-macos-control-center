'use strict';

const { createCanvas } = require('@napi-rs/canvas');
const { run } = require('../collectors/exec');

const BG = '#000000';
const TEXT = '#FFFFFF';
const GRAY = '#8E8E93';
const ACCENT = '#0A84FF';
const GREEN = '#30D158';

/**
 * Format uptime seconds to "Xd Xh Xm".
 * @param {number} seconds
 * @returns {string}
 */
function fmtUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

/**
 * Format bytes to human-readable (GB/MB).
 * @param {number} bytes
 * @returns {string}
 */
function fmtMem(bytes) {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(0)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

/**
 * Render the System Info page as a data URL.
 * Two-column layout when width >= 480, single column below.
 *
 * @param {object} info - { chip, cores, memTotal, model, diskUsed, diskTotal, uptime, osVersion }
 * @param {number} width - canvas width (default 480)
 * @returns {Promise<string>} data:image/png;base64,... data URL
 */
async function renderSystemInfo(info, width = 480) {
  const canvas = createCanvas(width, 60);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, 60);

  const padX = 8;
  let y = 11;

  // Line 1: Model + chip
  ctx.fillStyle = TEXT;
  ctx.font = 'bold 11px -apple-system, "SF Pro Text", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const modelStr = info.model || 'Mac';
  const chipStr = info.chip || '';
  ctx.fillText(`${modelStr} (${chipStr})`, padX, y);
  y += 13;

  // Line 2: Cores | Memory
  ctx.fillStyle = GRAY;
  ctx.font = '9px "SF Mono", Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const coresStr = info.cores ? `${info.cores} cores` : '';
  const memStr = info.memTotal ? fmtMem(info.memTotal) : '';
  ctx.fillText(`${coresStr}  |  ${memStr} RAM`, padX, y);
  y += 11;

  // Line 3: macOS version
  let osVer = 'macOS';
  try {
    const verOut = await run('sw_vers -productVersion');
    if (verOut) osVer = `macOS ${verOut.trim()}`;
  } catch (_) { /* ignore */ }
  ctx.fillStyle = GRAY;
  ctx.font = '9px "SF Mono", Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(osVer, padX, y);
  y += 11;

  // Line 4: Uptime
  let uptimeStr = '';
  if (info.uptime) {
    uptimeStr = `Uptime: ${fmtUptime(info.uptime)}`;
  } else {
    try {
      const upOut = await run('sysctl -n kern.boottime');
      // "sec = 1234567890" — parse boot time
      const match = upOut && upOut.match(/sec\s*=\s*(\d+)/);
      if (match) {
        const bootTime = parseInt(match[1], 10);
        const uptime = Math.floor(Date.now() / 1000) - bootTime;
        uptimeStr = `Up: ${fmtUptime(uptime)}`;
      }
    } catch (_) { /* ignore */ }
  }
  if (uptimeStr) {
    ctx.fillStyle = GRAY;
    ctx.font = '9px "SF Mono", Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(uptimeStr, padX, y);
  }

  // Line 5: Disk (right side of line 4)
  if (info.diskUsed && info.diskTotal) {
    ctx.fillStyle = ACCENT;
    ctx.font = '9px "SF Mono", Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`${info.diskUsed}/${info.diskTotal}`, 240 - padX, y);
  }

  return canvas.toDataURL('image/png');
}

module.exports = { renderSystemInfo };
