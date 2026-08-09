'use strict';

// Control Strip — full-width (2170px) aggregate bar rendered via directDraw.
// Entered by tapping the strip key; FlexDesigner switches to the directDraw page,
// then we paint the whole bar. device.touch events hit-test buttons by x.

const { createCanvas } = require('@napi-rs/canvas');

const BG = '#000000';
const BG_RAISED = '#1C1C1E';
const ACCENT = '#0A84FF';
const GREEN = '#30D158';
const RED = '#FF453A';
const ORANGE = '#FF9F0A';
const GRAY = '#8E8E93';
const TEXT = '#FFFFFF';

// Buttons are wide with horizontal (label left, state right) layout;
// data blocks compact. Total = 2140 ≤ 2170.
// Widths: total = 2160 ≤ 2170 so all 10 modules fit (stage was truncated before)
const MODULES = {
  cpu:        { width: 200, type: 'data' },
  mem:        { width: 200, type: 'data' },
  disk:       { width: 200, type: 'data' },
  net:        { width: 250, type: 'data' },
  sleep:      { width: 210, type: 'button' },
  lock:       { width: 210, type: 'button' },
  caffeinate: { width: 230, type: 'button' },
  darkmode:   { width: 230, type: 'button' },
  wifi:       { width: 210, type: 'button' },
  stage:      { width: 220, type: 'button' }
};
const TOTAL = Object.values(MODULES).reduce((s, m) => s + m.width, 0); // 2300 → trim later

const BUTTONS = {
  sleep:      'Sleep', lock: 'Lock', caffeinate: 'Caffeine',
  darkmode:   'Dark', wifi: 'WiFi', stage: 'Stage'
};

// Usage-bar color semantics: LOW = green, MID = yellow, HIGH = red
function usageColor(percent) {
  if (percent >= 80) return '#FF453A';
  if (percent >= 50) return '#FF9F0A';
  return '#30D158';
}

function fmtRate(bps) {
  if (bps >= 1048576) return (bps / 1048576).toFixed(1) + 'M';
  if (bps >= 1024) return (bps / 1024).toFixed(0) + 'K';
  return bps.toFixed(0) + 'B';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRing(ctx, cx, cy, r, percent, color) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = BG_RAISED; ctx.lineWidth = 5; ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(percent, 100) / 100));
  ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke();
  ctx.fillStyle = TEXT;
  ctx.font = '700 16px "SF Mono", Menlo, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(percent) + '%', cx, cy + 1);
}

function drawBar(ctx, x, y, w, h, percent, color) {
  ctx.fillStyle = BG_RAISED;
  roundRect(ctx, x, y, w, h, 3); ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, x, y, Math.max(4, w * Math.min(percent, 100) / 100), h, 3); ctx.fill();
}

function drawData(ctx, x, w, id, d) {
  ctx.fillStyle = GRAY;
  ctx.font = '400 10px -apple-system, "SF Pro Text", sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(id.toUpperCase(), x + 10, 6);
  switch (id) {
    case 'cpu': {
      drawRing(ctx, x + 50, 34, 19, d.cpu, ACCENT);
      ctx.fillStyle = TEXT;
      ctx.font = '700 14px "SF Mono", Menlo, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('L ' + (d.load1 || 0).toFixed(1), x + 78, 30);
      break;
    }
    case 'mem': {
      drawBar(ctx, x + 10, 26, w - 20, 10, d.mem, usageColor(d.mem));
      ctx.fillStyle = TEXT;
      ctx.font = '700 14px "SF Mono", Menlo, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(d.mem) + '%', x + 10, 44);
      ctx.fillStyle = GRAY;
      ctx.font = '400 10px "SF Mono", monospace';
      ctx.fillText(d.memGB || '', x + 60, 45);
      break;
    }
    case 'disk': {
      drawBar(ctx, x + 10, 26, w - 20, 10, d.disk, usageColor(d.disk));
      ctx.fillStyle = TEXT;
      ctx.font = '700 14px "SF Mono", Menlo, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(d.diskUsed || '', x + 10, 44);
      ctx.fillStyle = GRAY;
      ctx.font = '400 10px "SF Mono", monospace';
      ctx.fillText(d.diskTotal || '', x + 110, 45);
      break;
    }
    case 'net': {
      ctx.fillStyle = TEXT;
      ctx.font = '700 13px "SF Mono", Menlo, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('↓ ' + fmtRate(d.netDown), x + 10, 22);
      ctx.fillText('↑ ' + fmtRate(d.netUp), x + 10, 40);
      break;
    }
  }
}

function drawButton(ctx, x, w, id, states) {
  const active = !!states[id];
  ctx.fillStyle = active ? ACCENT : BG_RAISED;
  roundRect(ctx, x + 4, 8, w - 8, 44, 8); ctx.fill();
  const label = BUTTONS[id] || id;
  // Horizontal layout: label on the left, state on the right — bigger text
  ctx.fillStyle = active ? '#FFFFFF' : TEXT;
  ctx.font = '600 18px -apple-system, "SF Pro Text", sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 16, 30);
  ctx.fillStyle = active ? '#FFFFFF' : GRAY;
  ctx.font = '700 15px "SF Mono", Menlo, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(active ? 'ON' : 'OFF', x + w - 14, 30);
}

/**
 * Render the full control strip bar (directDraw page).
 * @returns {{ dataURL: string, layout: Array<{id,x0,x1}> }}
 */
function renderStrip(d) {
  const width = 2170;
  const canvas = createCanvas(width, 60);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, 60);

  const order = ['cpu', 'mem', 'disk', 'net', 'sleep', 'lock', 'caffeinate', 'darkmode', 'wifi', 'stage'];
  const layout = [];
  let x = 0;
  for (const id of order) {
    const w = MODULES[id].width;
    if (x + w > 2170) break; // stay within screen
    if (MODULES[id].type === 'data') drawData(ctx, x, w, id, d);
    else drawButton(ctx, x, w, id, d.states || {});
    layout.push({ id, x0: x, x1: x + w });
    x += w;
  }
  return { dataURL: canvas.toDataURL('image/png'), layout };
}

module.exports = { renderStrip };
