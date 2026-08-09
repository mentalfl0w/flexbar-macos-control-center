'use strict';

const { createCanvas } = require('@napi-rs/canvas');
const { drawGauge, drawBar } = require('./gauge');

// Flexbar Canvas colors (from apple-ui-guide.md)
const BG = '#000000';
const ACCENT = '#0A84FF';   // CPU — system blue
const GREEN = '#30D158';    // Memory — system green
const RED = '#FF453A';      // Disk — system red
const GRAY = '#8E8E93';     // Secondary text
const TEXT = '#FFFFFF';

/**
 * Format bytes per second to human-readable string.
 * @param {number} bps
 * @returns {string}
 */
// Usage-bar color semantics: LOW = green, MID = yellow, HIGH = red
function usageColor(percent) {
  if (percent >= 80) return '#FF453A'; // red — high usage
  if (percent >= 50) return '#FF9F0A'; // yellow — medium usage
  return '#30D158';                    // green — low usage
}

// Battery (remaining charge) semantics: LOW = red, MID = yellow, HIGH = green
function batteryColor(percent) {
  if (percent <= 20) return '#FF453A';
  if (percent <= 50) return '#FF9F0A';
  return '#30D158';
}

function fmtRate(bps) {
  if (bps < 1024) return `${bps}B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)}K/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)}M/s`;
}

/**
 * Render the Overview dashboard as a data URL.
 * Layout scales with width (default 720 = full strip width for rich content).
 *
 * @param {object} data - { cpu, mem, disk, netDown, netUp, power }
 * @param {number} width - canvas width, should match the key's actual width
 * @returns {string} data:image/png;base64,... data URL
 */
function renderOverview(data, width = 600) {
  const canvas = createCanvas(width, 60);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, 60);

  // Content density scales with available width — narrow keys show fewer blocks
  // (a 240px key showing 5 blocks would be cramped)
  const showAll = width >= 600;   // 5 blocks: CPU MEM NET DISK POWER
  const showMid = width >= 400;   // 3 blocks: CPU MEM NET
  // < 400: 2 blocks: CPU MEM

  const blockW = showAll ? 130 : (showMid ? 110 : 150);
  const startX = showAll ? 70 : (showMid ? 64 : 72);

  // --- CPU ring (left) ---
  drawGauge(ctx, 28, 28, 22, data.cpu || 0, ACCENT);
  ctx.fillStyle = GRAY;
  ctx.font = '9px -apple-system, "SF Pro Text", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('CPU', 28, 50);

  let x = startX;

  // --- Memory bar ---
  drawBar(ctx, x, 12, blockW, 12, data.mem || 0, usageColor(data.mem || 0));
  ctx.fillStyle = GRAY;
  ctx.font = '9px -apple-system, "SF Pro Text", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('MEM', x, 28);
  if (data.load1 !== undefined) {
    ctx.fillStyle = TEXT;
    ctx.font = '9px "SF Mono", Menlo, monospace';
    ctx.fillText(`load ${data.load1}`, x, 42);
  }
  x += blockW + 20;

  // --- Network text ---
  ctx.fillStyle = GRAY;
  ctx.font = '9px -apple-system, "SF Pro Text", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('NET', x, 15);
  ctx.fillStyle = TEXT;
  ctx.font = '11px "SF Mono", Menlo, monospace';
  ctx.fillText(`↓${fmtRate(data.netDown || 0)}`, x, 28);
  ctx.fillText(`↑${fmtRate(data.netUp || 0)}`, x, 42);
  x += showMid ? 120 : 0;
  if (!showAll) x = width; // stop

  // --- Disk bar ---
  if (showAll) {
    // No battery on this device (desktop) → stretch disk to fill the freed POWER space
    const hasBattery = data.batteryPercent !== undefined;
    const diskW = hasBattery ? blockW : Math.min(width - x - 14, blockW + 170);
    drawBar(ctx, x, 12, diskW, 12, data.disk || 0, usageColor(data.disk || 0));
    ctx.fillStyle = GRAY;
    ctx.font = '9px -apple-system, "SF Pro Text", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('DISK', x, 28);
    if (data.diskUsed && data.diskTotal) {
      ctx.fillStyle = TEXT;
      ctx.font = '9px "SF Mono", Menlo, monospace';
      ctx.fillText(`${data.diskUsed}/${data.diskTotal}`, x, 42);
    }
    x += diskW + 20;
    x += blockW + 20;

    // --- Battery status (only on devices with a real battery, e.g. MacBook) ---
    if (data.batteryPercent !== undefined) {
      ctx.fillStyle = GRAY;
      ctx.font = '9px -apple-system, "SF Pro Text", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('POWER', x, 15);
      const battColor = batteryColor(data.batteryPercent);
      ctx.fillStyle = battColor;
      ctx.font = 'bold 11px "SF Mono", Menlo, monospace';
      const battText = data.charging ? `⚡${data.batteryPercent}%` : `${data.batteryPercent}%`;
      ctx.fillText(battText, x, 30);
    }
  }

  // --- Caffeinate status (right edge) ---
  if (data.caffeinating) {
    ctx.fillStyle = ACCENT;
    ctx.font = '10px "SF Mono", Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('☕ ON', width - 8, 30);
  }

  return canvas.toDataURL('image/png');
}

module.exports = { renderOverview };
