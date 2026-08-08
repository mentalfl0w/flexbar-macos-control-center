'use strict';

const { exec, execFile } = require('child_process');
const { run } = require('../collectors/exec');

/**
 * Toggle Dark Mode on/off via AppleScript.
 * @returns {Promise<boolean>}
 */
async function toggleDarkMode() {
  return new Promise((resolve) => {
    exec(
      "osascript -e 'tell app \"System Events\" to set dark mode to not dark mode'",
      (err) => resolve(!err)
    );
  });
}

/**
 * Get the current Dark Mode state.
 * @returns {Promise<boolean>} true if Dark Mode is on
 */
async function getDarkMode() {
  const out = await run('defaults read -g AppleInterfaceStyle');
  // If the command succeeds and returns "Dark", dark mode is on.
  // If it fails (no value), dark mode is off (light).
  return out !== null && out.trim() === 'Dark';
}

/**
 * Get the Wi-Fi interface name (e.g., "en0") by parsing networksetup.
 * @returns {Promise<string|null>}
 */

/**
 * Toggle Wi-Fi power on/off.
 * @returns {Promise<boolean>}
 */
async function getWifiInterface() {
  return new Promise((resolve) => {
    execFile('networksetup', ['-listallhardwareports'], { timeout: 5000 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const m = stdout.match(/Hardware Port: Wi-Fi\s*\nDevice: (en\d+)/);
      resolve(m ? m[1] : null);
    });
  });
}

async function toggleWifi() {
  const iface = await getWifiInterface();
  if (!iface) return false;

  const isOn = await getWifiState();
  const newState = isOn ? 'off' : 'on';
  return new Promise((resolve) => {
    exec(
      `networksetup -setairportpower ${iface} ${newState}`,
      (err) => resolve(!err)
    );
  });
}

/**
 * Get current Wi-Fi power state.
 * @returns {Promise<boolean>} true if Wi-Fi is on
 */
async function getWifiState() {
  const iface = await getWifiInterface();
  if (!iface) return false;

  const out = await run(`networksetup -getairportpower ${iface}`);
  if (!out) return false;
  return out.includes('On');
}

/**
 * Toggle Stage Manager on/off.
 * @returns {Promise<boolean>}
 */
async function toggleStageManager() {
  const isOn = await getStageManager();
  const newVal = isOn ? 'false' : 'true';
  return new Promise((resolve) => {
    exec(
      `defaults write com.apple.WindowManager GloballyEnabled -bool ${newVal}`,
      (err) => resolve(!err)
    );
  });
}

/**
 * Get current Stage Manager state.
 * @returns {Promise<boolean>} true if Stage Manager is enabled
 */
async function getStageManager() {
  const out = await run('defaults read com.apple.WindowManager GloballyEnabled');
  if (out === null) return false;
  return out.trim() === '1';
}

module.exports = {
  toggleDarkMode,
  getDarkMode,
  toggleWifi,
  getWifiState,
  toggleStageManager,
  getStageManager
};
