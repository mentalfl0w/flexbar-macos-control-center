'use strict';

const { exec } = require('child_process');
const { spawn, execFile } = require('child_process');

let caffeinateProc = null;
let caffeinateStart = 0;

/**
 * Run a command via exec, returning a promise that resolves to true on success.
 * @param {string} cmd
 * @returns {Promise<boolean>}
 */
function runCmd(cmd) {
  return new Promise((resolve) => {
    exec(cmd, (err) => {
      resolve(!err);
    });
  });
}

/**
 * Put the system to sleep immediately.
 * @returns {Promise<boolean>}
 */
async function sleepNow() {
  return runCmd('pmset sleepnow');
}

/**
 * Lock the screen by putting the display to sleep.
 * @returns {Promise<boolean>}
 */
async function lockScreen() {
  return runCmd('pmset displaysleepnow');
}

/**
 * Shut down the Mac via AppleScript.
 * NOTE: Only wraps the command — does NOT execute unless explicitly called.
 * @returns {Promise<boolean>}
 */
async function shutdown() {
  return runCmd("osascript -e 'tell app \"System Events\" to shut down'");
}

/**
 * Restart the Mac via AppleScript.
 * NOTE: Only wraps the command — does NOT execute unless explicitly called.
 * @returns {Promise<boolean>}
 */
async function restart() {
  return runCmd("osascript -e 'tell app \"System Events\" to restart'");
}

/**
 * Start caffeinate to prevent display sleep (-d flag).
 */
function startCaffeinate() {
  if (caffeinateProc) {
    return;
  }
  // Absolute path: plugin process PATH may not include /usr/bin (FlexDesigner Helper env)
  caffeinateProc = spawn('/usr/bin/caffeinate', ['-d'], { stdio: 'ignore' });
  caffeinateStart = Date.now();

  caffeinateProc.on('error', (e) => {
    logger.debug('caffeinate spawn error: ' + (e && e.message));
    caffeinateProc = null;
    caffeinateStart = 0;
  });

  caffeinateProc.on('exit', () => {
    caffeinateProc = null;
    caffeinateStart = 0;
  });
}

/**
 * Stop the caffeinate process.
 */
function stopCaffeinate() {
  // Async: send SIGTERM and wait for the process to actually exit, so callers can
  // re-check system state without racing the dying process.
  return new Promise((resolve) => {
    if (!caffeinateProc) return resolve();
    const proc = caffeinateProc;
    caffeinateProc = null;
    caffeinateStart = 0;
    const done = () => resolve();
    proc.on('exit', done);
    proc.on('error', done);
    proc.kill('SIGTERM');
    // Safety: don't hang forever if the process ignores the signal
    setTimeout(done, 2000).unref();
  });
}

/**
 * Check if caffeinate is currently active.
 * @returns {boolean}
 */
function isCaffeinating() {
  return caffeinateProc !== null;
}

/**
 * Detect whether ANY caffeinate process is active system-wide (including ones
 * started outside this plugin, e.g. manually in a terminal).
 * @returns {Promise<boolean>}
 */
function checkSystemCaffeinating() {
  return new Promise((resolve) => {
    if (caffeinateProc) return resolve(true);
    execFile('pgrep', ['-x', 'caffeinate'], { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout || !stdout.trim()) return resolve(false);
      resolve(true);
    });
  });
}

/**
 * Kill ALL caffeinate processes system-wide (orphans included).
 * "Turn off" must mean the system truly stops caffeinating.
 * @returns {Promise<boolean>} true if any process was killed
 */
function stopAllCaffeinate() {
  return new Promise((resolve) => {
    if (caffeinateProc) {
      caffeinateProc.kill('SIGTERM');
      caffeinateProc = null;
      caffeinateStart = 0;
    }
    execFile('pkill', ['-x', 'caffeinate'], { timeout: 3000 }, () => {
      // pkill is async — poll until every caffeinate process is really gone so
      // callers can re-check state and redraw accurately (no "still ON" race).
      const deadline = Date.now() + 2500;
      const poll = () => {
        execFile('pgrep', ['-x', 'caffeinate'], { timeout: 1500 }, (err2, out) => {
          if (!err2 && out && out.trim()) {
            if (Date.now() < deadline) return setTimeout(poll, 200);
          }
          resolve(true);
        });
      };
      poll();
    });
  });
}

/**
 * Get the duration (ms) caffeinate has been active.
 * @returns {number}
 */

module.exports = {
  sleepNow,
  lockScreen,
  shutdown,
  restart,
  startCaffeinate,
  stopCaffeinate,
  isCaffeinating,
  checkSystemCaffeinating,
  stopAllCaffeinate,

};
