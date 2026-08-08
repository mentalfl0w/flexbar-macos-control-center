'use strict';

/**
 * Draw a circular gauge (ring) showing a percentage.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - center X
 * @param {number} y - center Y
 * @param {number} r - radius
 * @param {number} percent - 0-100
 * @param {string} color - arc color
 */
function drawGauge(ctx, x, y, r, percent, color) {
  const clamped = Math.max(0, Math.min(100, percent));
  const start = -Math.PI / 2; // start from top
  const end = start + (clamped / 100) * Math.PI * 2;

  // Background ring
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.stroke();

  // Foreground arc
  if (clamped > 0) {
    ctx.beginPath();
    ctx.arc(x, y, r, start, end);
    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Percentage text in center
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 14px "SF Mono", Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(clamped)}%`, x, y);
}

/**
 * Draw a rounded-corner progress bar.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - top-left X
 * @param {number} y - top-left Y
 * @param {number} w - total width
 * @param {number} h - height
 * @param {number} percent - 0-100
 * @param {string} color - fill color
 */
function drawBar(ctx, x, y, w, h, percent, color) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = Math.min(h / 2, 4);

  // Background
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fill();

  // Foreground fill
  if (clamped > 0) {
    const fillW = Math.max(radius * 2, (clamped / 100) * w);
    ctx.beginPath();
    roundRect(ctx, x, y, fillW, h, radius);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Percentage label
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '10px "SF Mono", Menlo, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(clamped)}%`, x + w - 4, y + h / 2);
}

/**
 * Helper: draw a rounded rectangle path.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

module.exports = { drawGauge, drawBar, roundRect };
