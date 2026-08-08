'use strict';

const { exec } = require('child_process');
const { run } = require('../collectors/exec');

/**
 * Interactive screenshot — user selects an area, image is copied to clipboard.
 * @returns {Promise<boolean>}
 */
async function screenshot() {
  return new Promise((resolve) => {
    exec('screencapture -i -c', (err) => resolve(!err));
  });
}

/**
 * Full-screen screenshot saved to Desktop with timestamp.
 * @returns {Promise<boolean>}
 */
async function fullScreenshot() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const path = `${process.env.HOME}/Desktop/screenshot-${ts}.png`;
  return new Promise((resolve) => {
    exec(`screencapture "${path}"`, (err) => resolve(!err));
  });
}

/**
 * Empty the trash via Finder AppleScript.
 * @returns {Promise<boolean>}
 */
async function emptyTrash() {
  return new Promise((resolve) => {
    exec(
      "osascript -e 'tell application \"Finder\" to empty trash'",
      (err) => resolve(!err)
    );
  });
}

module.exports = {
  screenshot,
  fullScreenshot,
  emptyTrash
};
