'use strict';

// Crash capture: log unhandled rejections / exceptions instead of silently dying
process.on('unhandledRejection', (e) => {
  try { logger.error('UNHANDLED REJECTION: ' + (e && e.stack ? e.stack.split('\n').slice(0, 6).join(' | ') : String(e))); } catch (_) {}
});
process.on('uncaughtException', (e) => {
  try { logger.error('UNCAUGHT EXCEPTION: ' + (e && e.stack ? e.stack.split('\n').slice(0, 6).join(' | ') : String(e))); } catch (_) {}
});


const { plugin, logger, resourcesPath } = require('@eniac/flexdesigner');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const cpuCollector = require('./collectors/cpu');
const memCollector = require('./collectors/memory');
const diskCollector = require('./collectors/disk');
const netCollector = require('./collectors/network');
const batteryCollector = require('./collectors/battery');
const systemCollector = require('./collectors/system');

const power = require('./actions/power');
const toggles = require('./actions/toggles');
const shortcuts = require('./actions/shortcuts');

const { renderOverview } = require('./renderer/overview');
const { renderSystemInfo } = require('./renderer/systeminfo');
const { renderStrip } = require('./renderer/strip');

const STRIP_CID = 'com.dylanL.maccontrol.strip';

// ============================================================
// MacControlPlugin
// ============================================================
class MacControlPlugin {
  constructor() {
    // Pre-rendered SF Symbol coffee cup (cup.and.saucer.fill) — white for ON, gray for OFF
    this.coffeeOnImg = null;
    this.coffeeOffImg = null;
    this.coffeeIconPromise = null;

    // Control Strip (directDraw page) state: serialNumber -> { layout, timer }
    this.stripState = {};

    // --- State ---
    this.keyData = {};        // uid -> key object
    this.serialNumber = null;
    this.config = {
      refreshInterval: 5000,
      theme: 'dark',
      safeLongPress: 3000
    };

    // Serialized command queue: FlexDesigner plugin channel times out under concurrency.
    // Every draw/sendChartData/dynamickey call goes through queued() so only one is in flight.
    this.cmdQueue = Promise.resolve();

    // Timers
    this.monitorTimer = null;
    this.overviewTimer = null;
    this.systemInfoTimer = null;

    // Long-press tracking for dangerous actions
    this.pressTracker = {};  // uid -> { startTime, cid }

    // Latest cached data for overview
    this.latestData = {
      cpu: 0,
      mem: 0,
      disk: 0,
      netDown: 0,
      netUp: 0,
      load1: 0,
      power: '',
      batteryPercent: undefined,
      charging: false,
      caffeinating: false,
      diskUsed: '',
      diskTotal: '',
      memGB: ''
    };

    this.systemInfo = null;
  }

  // Serialized command queue: FlexDesigner plugin channel times out under concurrency.
  // Every draw/sendChartData/dynamickey call goes through queued() so only one is in flight.
  queued(fn) {
    this.cmdQueue = this.cmdQueue.then(fn).catch((e) => logger.debug('cmd error: ' + (e && e.message)));
    return this.cmdQueue;
  }

  // FlexDesigner sends key type under key.cfg (NOT key.config) in alive payloads.
  getKeyType(key) {
    return (key.cfg && key.cfg.keyType) || (key.config && key.config.keyType);
  }

  // Update multiState keys via plugin.set() — the pattern used by working plugins
  // (Apple Music). setMultiState() has a strict keyType==='multiState' validation
  // that fails against FlexDesigner's lowercase 'multistate'; set() has no such check.
  async safeSetMultiState(sn, key, state, message) {
    // Apple Music pattern: set({state}) only — passing a message string may cause
    // a persistent render glitch on the device (flowering icon).
    // NOTE: do NOT re-send the same set shortly after — a duplicate set races the
    // device renderer and can leave a button permanently flowered.
    void message;
    try {
      await plugin.set(sn, key, { state });
    } catch (e) {
      logger.debug('set state failed: ' + (e && e.message));
    }
  }

  // ============================================================
  // Config
  // ============================================================

  // ============================================================
  // Monitoring: sendChartData for individual keys
  // ============================================================
  async collectAndSend() {
    // Determine target device(s): prefer keys that carry serialNumber (per-device isolation)
    const targetSn = (function () {
      for (const k of Object.values(this.keyData)) {
        if (k.serialNumber) return k.serialNumber;
      }
      return this.serialNumber;
    }).call(this);
    if (!targetSn) return;

    // Collect all metrics, then send ONE combined chart-data batch (avoids channel concurrency)
    const [cpu, mem, disk, net] = await Promise.all([
      cpuCollector.collect().catch(() => null),
      memCollector.collect().catch(() => null),
      diskCollector.collect().catch(() => null),
      netCollector.collect().catch(() => null)
    ]);

    if (cpu) {
      this.latestData.cpu = cpu.usage;
      this.latestData.load1 = cpu.load1;
    }
    if (mem) {
      this.latestData.mem = mem.usedPercent;
      this.latestData.memGB = (mem.usedBytes / (1024 * 1024 * 1024)).toFixed(1);
    }
    if (disk) {
      this.latestData.disk = disk.percent;
      this.latestData.diskUsed = `${disk.usedGB}G`;
      this.latestData.diskTotal = `${disk.totalGB}G`;
    }
    if (net) {
      this.latestData.netDown = Number.isFinite(net.downBps) ? net.downBps : 0;
      this.latestData.netUp = Number.isFinite(net.upBps) ? net.upBps : 0;
    }

    const chartBatch = [];
    if (cpu) {
      chartBatch.push(
        { label: 'CPU Usage', value: cpu.usage, unit: '%', baseUnit: '%', baseVal: cpu.usage, maxLen: 1, category: 'system', key: 'cpu' },
        { label: 'Load Avg (1m)', value: cpu.load1, unit: '', baseUnit: '', baseVal: cpu.load1, maxLen: 2, category: 'system', key: 'load1' }
      );
    }
    if (mem) {
      const memGB = mem.usedBytes / (1024 * 1024 * 1024);
      chartBatch.push(
        { label: 'Memory Used', value: Math.round(memGB * 100) / 100, unit: 'GB', baseUnit: 'bytes', baseVal: mem.usedBytes, maxLen: 2, category: 'system', key: 'memory' },
        { label: 'Memory Pressure', value: mem.pressure, unit: '%', baseUnit: '%', baseVal: mem.pressure, maxLen: 1, category: 'system', key: 'mempressure' }
      );
    }
    if (disk) {
      chartBatch.push(
        { label: 'Disk Usage', value: disk.percent, unit: '%', baseUnit: '%', baseVal: disk.percent, maxLen: 1, category: 'system', key: 'disk' },
        { label: 'Disk I/O', value: disk.mbps, unit: 'MB/s', baseUnit: 'MB/s', baseVal: disk.mbps, maxLen: 2, category: 'system', key: 'diskio' }
      );
    }
    if (net) {
      const downMbps = net.downBps / (1024 * 1024);
      const upMbps = net.upBps / (1024 * 1024);
      chartBatch.push(
        { label: 'Download', value: Math.round(downMbps * 100) / 100, unit: 'MB/s', baseUnit: 'B/s', baseVal: net.downBps, maxLen: 2, category: 'network', key: 'download' },
        { label: 'Upload', value: Math.round(upMbps * 100) / 100, unit: 'MB/s', baseUnit: 'B/s', baseVal: net.upBps, maxLen: 2, category: 'network', key: 'upload' }
      );
    }
    if (chartBatch.length) {
      this.queued(() => plugin.sendChartData(chartBatch));
    }

    // Battery
    try {
      const batt = await batteryCollector.collect();
      if (batt) {
        if (batt.hasBattery) {
          this.latestData.batteryPercent = batt.percent;
          this.latestData.charging = batt.charging;
          this.latestData.power = batt.charging ? 'Charging' : 'Battery';
        } else {
          this.latestData.power = 'AC Power';
          this.latestData.batteryPercent = undefined;
        }
      }
    } catch (e) {
      logger.debug('Battery collect error:', e.message);
    }

    // Caffeinate status
    try { this.latestData.caffeinating = await power.checkSystemCaffeinating(); } catch (_) {}
  }

  // ============================================================
  // Overview: Canvas directDraw
  // ============================================================
  async updateOverview() {
    // Update every overview key (Control Strip page + Monitor page may both host it)
    const overviewKeys = this.findAllKeysByCid('com.dylanL.maccontrol.overview');
    for (const overviewKey of overviewKeys) {
      if (!overviewKey.serialNumber) continue;
      try {
        const dataUrl = renderOverview(this.latestData, overviewKey.width || 720);
        this.queued(() => plugin.draw(overviewKey.serialNumber, overviewKey, 'base64', dataUrl));
      } catch (e) {
        logger.debug('Overview render error:', e.message);
      }
    }
  }

  // ============================================================
  // SystemInfo: Canvas directDraw
  // ============================================================
  async updateSystemInfo() {
    const sysKeys = this.findAllKeysByCid('com.dylanL.maccontrol.systeminfo');
    if (!sysKeys.length) return;

    try {
      if (!this.systemInfo) {
        this.systemInfo = await systemCollector.collect();
      }
      // Get disk info for display
      const disk = await diskCollector.collect();
      if (this.systemInfo) {
        const info = {
          ...this.systemInfo,
          diskUsed: disk ? `${disk.usedGB}G` : '',
          diskTotal: disk ? `${disk.totalGB}G` : ''
        };
        for (const sysKey of sysKeys) {
          if (!sysKey.serialNumber) continue;
          const dataUrl = await renderSystemInfo(info, sysKey.width || 480);
          this.queued(() => plugin.draw(sysKey.serialNumber, sysKey, 'base64', dataUrl));
        }
      }
    } catch (e) {
      logger.debug('SystemInfo render error:', e.message);
    }
  }

  // ============================================================
  // Helpers
  // ============================================================
  // Return ALL keys matching a cid (Control Strip page + Monitor/Power pages may host the same cid)
  findAllKeysByCid(cid) {
    return Object.values(this.keyData).filter((k) => k.cid === cid);
  }



  // ============================================================
  // Long-press confirmation for dangerous actions
  // ============================================================

  snackbar(sn, message, type = 'warning') {
    try {
      plugin.showFlexbarSnackbarMessage(sn, message, type, '', 2000, false);
    } catch (_) { /* ignore */ }
  }

  // ============================================================
  // Caffeinate button: canvas-drawn. FlexDesigner accepts plugin.set() but does
  // NOT push the visual to the device (observed: first tap never updates native
  // multiState rendering), so we draw the state ourselves. Rounded to match style.
  // ============================================================

  loadCoffeeIcons() {
    if (!this.coffeeIconPromise) {
      this.coffeeIconPromise = Promise.all([
        loadImage(path.join(resourcesPath, 'icons/caffeinate_on.png')),
        loadImage(path.join(resourcesPath, 'icons/caffeinate_off.png'))
      ]).then(([on, off]) => {
        this.coffeeOnImg = on;
        this.coffeeOffImg = off;
      }).catch((e) => {
        logger.debug('coffee icon load error: ' + e.message);
      });
    }
    return this.coffeeIconPromise;
  }

  async renderToggleButton(sn, key, type) {
    try {
      // Reconnect/realive changes key.uid — always use the latest key object
      const live = Object.values(this.keyData).find((k) => k.cid === key.cid && k.serialNumber === sn);
      if (live) key = live;
      let on = false;
      try {
        if (type === 'darkmode') on = await toggles.getDarkMode();
        else if (type === 'wifi') on = await toggles.getWifiState();
        else if (type === 'stage') on = await toggles.getStageManager();
      } catch (e) { /* keep false */ }

      const w = key.width || 240;
      const canvas = createCanvas(w, 60);
      const ctx = canvas.getContext('2d');
      // Rounded background (native key look)
      ctx.beginPath();
      ctx.moveTo(5, 3);
      ctx.arcTo(w - 3, 3, w - 3, 57, 10);
      ctx.arcTo(w - 3, 57, 5, 57, 10);
      ctx.arcTo(5, 57, 5, 3, 10);
      ctx.arcTo(5, 3, w - 3, 3, 10);
      ctx.closePath();
      ctx.fillStyle = on ? '#0A84FF' : '#1C1C1E';
      ctx.fill();

      await loadToggleIcons();
      const imgs = toggleImgCache[type];
      const icon = imgs ? (on ? imgs.on : imgs.off) : null;
      if (icon) {
        const iconSize = 56;
        ctx.drawImage(icon, (w - iconSize) / 2, (60 - iconSize) / 2, iconSize, iconSize);
      }
      this.queued(() => plugin.draw(sn, key, 'base64', canvas.toDataURL('image/png')));
    } catch (e) {
      logger.debug('Toggle render error (' + type + '): ' + e.message);
    }
  }

  async renderCaffeinateButton(sn, key) {
    try {
      // Reconnect/realive changes key.uid — always use the latest key object
      const live = Object.values(this.keyData).find((k) => k.cid === key.cid && k.serialNumber === sn);
      if (live) key = live;
      const on = await power.checkSystemCaffeinating();
      const w = key.width || 240;
      const canvas = createCanvas(w, 60);
      const ctx = canvas.getContext('2d');
      // Rounded background (native key look)
      ctx.beginPath();
      ctx.moveTo(5, 3);
      ctx.arcTo(w - 3, 3, w - 3, 57, 10);
      ctx.arcTo(w - 3, 57, 5, 57, 10);
      ctx.arcTo(5, 57, 5, 3, 10);
      ctx.arcTo(5, 3, w - 3, 3, 10);
      ctx.closePath();
      ctx.fillStyle = on ? '#0A84FF' : '#1C1C1E';
      ctx.fill();
      // macOS SF Symbol coffee cup (cup.and.saucer.fill), centered
      await this.loadCoffeeIcons();
      const icon = on ? this.coffeeOnImg : this.coffeeOffImg;
      if (icon) {
        const iconSize = 56;
        ctx.drawImage(icon, (w - iconSize) / 2, (60 - iconSize) / 2, iconSize, iconSize);
      }
      this.queued(() => plugin.draw(sn, key, 'base64', canvas.toDataURL('image/png')));
    } catch (e) {
      logger.debug('Caffeinate render error: ' + e.message);
    }
  }

  // ============================================================
  // Timers
  // ============================================================
  startTimers() {
    this.stopTimers();
    const interval = this.config.refreshInterval || 5000;

    // Chart data every `interval` (5s default). First fire offset +1s so it
    // doesn't align with overview's first redraw.
    this.monitorTimer = setTimeout(() => {
      this.collectAndSend().catch(() => {});
      this.monitorTimer = setInterval(() => this.collectAndSend().catch(() => {}), interval);
    }, 1000);

    // Overview redraws every 10s — full redraws flicker if too frequent.
    // Offset +3s so the three timers never align on the same tick.
    this.overviewTimer = setTimeout(() => {
      this.updateOverview().catch(() => {});
      this.overviewTimer = setInterval(() => this.updateOverview().catch(() => {}), Math.max(interval * 2, 10000));
    }, 3000);

    // SystemInfo redraws every 60s (was 30s) — it is a full-key redraw and
    // users observed flicker. Offset +5s.
    this.systemInfoTimer = setTimeout(() => {
      this.updateSystemInfo().catch(() => {});
      this.systemInfoTimer = setInterval(() => this.updateSystemInfo().catch(() => {}), 60000);
    }, 5000);
  }

  stopTimers() {
    if (this.monitorTimer) { clearInterval(this.monitorTimer); this.monitorTimer = null; }
    if (this.overviewTimer) { clearInterval(this.overviewTimer); this.overviewTimer = null; }
    if (this.systemInfoTimer) { clearInterval(this.systemInfoTimer); this.systemInfoTimer = null; }
  }

  // ============================================================
  // Init multistate keys based on current system state
  // ============================================================
  async initMultistateKey(sn, key) {
    // No multiState keys remain in the manifest — all toggles are self-drawn.
    // Kept as a no-op guard for legacy configs carrying multiState keyType.
  }

  // ============================================================
  // Control Strip: click-to-enter full-width directDraw bar
  // ============================================================
  async buildStripData() {
    const states = {};
    try { states.caffeinate = await power.checkSystemCaffeinating(); } catch (_) {}
    try { states.darkmode = await toggles.getDarkMode(); } catch (_) {}
    try { states.wifi = await toggles.getWifiState(); } catch (_) {}
    try { states.stage = await toggles.getStageManager(); } catch (_) {}
    return {
      cpu: this.latestData.cpu, mem: this.latestData.mem, disk: this.latestData.disk,
      netDown: this.latestData.netDown, netUp: this.latestData.netUp, load1: this.latestData.load1,
      diskUsed: this.latestData.diskUsed, diskTotal: this.latestData.diskTotal, memGB: this.latestData.memGB,
      states
    };
  }

  // FlexDesigner switches to the directDraw page asynchronously after the tap —
  // directDraw fails with "not a direct draw key" until the page is active.
  // Draw with delayed retries to ride out the page-activation window.
  async refreshStrip(sn, key, attempt = 0) {
    try {
      // Use the latest key object for this cid (device reconnect changes uid)
      const live = Object.values(this.keyData).find((k) => k.cid === STRIP_CID && k.serialNumber === sn);
      if (live) key = live;
      const data = await this.buildStripData();
      const { dataURL, layout } = renderStrip(data);
      this.stripState[sn] = this.stripState[sn] || {};
      this.stripState[sn].layout = layout;
      await plugin.directDraw(sn, key, dataURL, false, 0);
    } catch (e) {
      if (attempt < 3) {
        setTimeout(() => this.refreshStrip(sn, key, attempt + 1).catch(() => {}), 800 * (attempt + 1));
      } else {
        logger.debug('Strip directDraw failed: ' + (e && e.message));
        plugin.showFlexbarSnackbarMessage(sn, 'Strip draw failed', 'error', '', 1500, false).catch(() => {});
      }
    }
  }

  enterStrip(sn, key) {
    if (this.stripState[sn] && this.stripState[sn].timer) clearInterval(this.stripState[sn].timer);
    this.stripState[sn] = { active: true, layout: [], timer: null };
    this.refreshStrip(sn, key).catch(() => {});
    // Keep the strip fresh while active
    this.stripState[sn].timer = setInterval(() => {
      this.collectAndSend().then(() => this.refreshStrip(sn, key)).catch(() => {});
    }, 5000);
    try { plugin.sendControlCommand(sn, 'hapic.click'); } catch (_) {}
    logger.info('Strip entered on device ' + sn);
  }

  exitStrip(sn) {
    const st = this.stripState[sn];
    if (st && st.timer) clearInterval(st.timer);
    delete this.stripState[sn];
  }

  // Touch hit-testing while the directDraw strip page is active
  async handleStripTouch(sn, payload) {
    const st = this.stripState[sn];
    if (!st || !st.active || !st.layout) return;
    // Only act on touch-UP — down and up both fire and would double-toggle
    if (payload.state !== 'up') return;
    const hit = st.layout.find((m) => payload.x >= m.x0 && payload.x < m.x1);
    if (!hit || MODULE_TYPE[hit.id] !== 'button') return;

    logger.info('Strip touch: ' + hit.id + ' x=' + Math.round(payload.x));
    const key = Object.values(this.keyData).find((k) => k.cid === STRIP_CID);
    if (!key) return;

    switch (hit.id) {
      case 'sleep':
        power.sleepNow().catch(() => {});
        break;
      case 'lock':
        power.lockScreen().catch(() => {});
        break;
      case 'caffeinate':
        if (await power.checkSystemCaffeinating()) await power.stopAllCaffeinate(); else power.startCaffeinate();
        break;
      case 'darkmode':
        await toggles.toggleDarkMode();
        break;
      case 'wifi':
        await toggles.toggleWifi();
        break;
      case 'stage':
        await toggles.toggleStageManager();
        break;
      default:
        return;
    }
    this.refreshStrip(sn, key).catch(() => {});
    try { plugin.sendControlCommand(sn, 'hapic.click'); } catch (_) {}
  }

  // ============================================================
  // Dangerous action handler (long-press confirmation)
  // ============================================================
  handleDangerousAction(sn, key, data) {
    // FlexDesigner sends only evt:'click' — there are no press-duration events.
    // Use double-tap confirm: first tap arms, second tap within 10s executes.
    const cid = key.cid;
    const uid = key.uid;
    const now = Date.now();

    const actionName = cid === 'com.dylanL.maccontrol.shutdown' ? 'shut down'
                     : cid === 'com.dylanL.maccontrol.restart' ? 'restart'
                     : 'empty trash';

    const armed = this.pressTracker[uid];
    if (!armed || (now - armed.startTime) > 10000) {
      // First tap (or stale arm) — arm the confirm
      this.pressTracker[uid] = { startTime: now, cid };
      this.snackbar(sn, 'Tap again to ' + actionName, 'warning');
      return { status: 'success', message: 'Confirm required' };
    }

    // Second tap within window — execute
    delete this.pressTracker[uid];
    if (cid === 'com.dylanL.maccontrol.shutdown') {
      power.shutdown().catch(() => {});
      this.snackbar(sn, 'Shutting down…', 'warning');
    } else if (cid === 'com.dylanL.maccontrol.restart') {
      power.restart().catch(() => {});
      this.snackbar(sn, 'Restarting…', 'warning');
    } else if (cid === 'com.dylanL.maccontrol.emptytrash') {
      shortcuts.emptyTrash().then((ok) => {
        this.snackbar(sn, ok ? 'Trash emptied' : 'Failed', ok ? 'success' : 'error');
      }).catch(() => {});
    }
    return { status: 'success', message: 'Action executed' };
  }

  // ============================================================
  // Caffeinate handler
  // ============================================================
  async handleCaffeinate(sn, key) {
    // Toggle based on REAL system state (orphan processes keep the system caffeinating)
    const on = await power.checkSystemCaffeinating();
    if (on) {
      await power.stopAllCaffeinate();
      this.snackbar(sn, 'Caffeinate stopped', 'info');
    } else {
      power.startCaffeinate();
      this.snackbar(sn, 'Caffeinate active', 'success');
    }
    // Self-drawn visual: redraw after the process state settles (kill is async at OS level)
    setTimeout(() => this.renderCaffeinateButton(sn, key).catch(() => {}), 400);
    try { plugin.sendControlCommand(sn, 'hapic.click'); } catch (_) {}
    return { status: 'success', message: 'Caffeinate toggled' };
  }

  // ============================================================
  // Toggle handler
  // ============================================================
  async handleToggle(sn, key, type) {
    try {
      let success = false;
      let newState = false;

      switch (type) {
        case 'darkmode':
          success = await toggles.toggleDarkMode();
          newState = await toggles.getDarkMode();
          break;
        case 'wifi':
          success = await toggles.toggleWifi();
          newState = await toggles.getWifiState();
          break;
        case 'stage':
          success = await toggles.toggleStageManager();
          newState = await toggles.getStageManager();
          break;
      }

      if (success) {
        // Self-drawn visual — native multiState set() is accepted by the server
        // but not pushed to the device (observed on caffeinate), so draw instead.
        this.renderToggleButton(sn, key, type).catch(() => {});
        const labels = { darkmode: 'Dark Mode', wifi: 'WiFi', stage: 'Stage Manager' };
        this.snackbar(sn, `${labels[type]} ${newState ? 'ON' : 'OFF'}`, 'success');
      } else {
        this.snackbar(sn, 'Toggle failed', 'error');
      }

      try { plugin.sendControlCommand(sn, 'hapic.click'); } catch (_) {}
    } catch (e) {
      logger.debug(`Toggle ${type} error:`, e.message);
      this.snackbar(sn, 'Toggle error', 'error');
    }

    return { status: 'success', message: `${type} toggled` };
  }

  // ============================================================
  // Screenshot handler
  // ============================================================
  handleScreenshot(sn, data) {
    // NOTE: FlexDesigner only sends evt:'click' — pressDuration/holdTime do not
    // exist in the payload, so long-press detection was dead code. Use the
    // double-tap pattern instead: first tap = interactive area capture to
    // clipboard, second tap within 10s = full screen to Desktop.
    const now = Date.now();
    const armed = this.pressTracker[sn + ':screenshot'];
    if (!armed || (now - armed.startTime) > 10000) {
      this.pressTracker[sn + ':screenshot'] = { startTime: now };
      this.snackbar(sn, 'Select area to capture — tap again for full screen', 'info');
      shortcuts.screenshot().then((ok) => {
        this.snackbar(sn, ok ? 'Copied to clipboard' : 'Screenshot failed', ok ? 'success' : 'error');
      }).catch(() => {});
      return { status: 'success', message: 'Area capture' };
    }
    delete this.pressTracker[sn + ':screenshot'];
    this.snackbar(sn, 'Capturing full screen...', 'info');
    shortcuts.fullScreenshot().then((ok) => {
      this.snackbar(sn, ok ? 'Saved to Desktop' : 'Screenshot failed', ok ? 'success' : 'error');
    }).catch(() => {});
    return { status: 'success', message: 'Full capture' };
  }

  // ============================================================
  // Lifecycle event handlers
  // ============================================================

  // Touch events while the strip (directDraw page) is active
  onTouch(payload) {
    const { serialNumber: sn } = payload;
    if (this.stripState[sn] && this.stripState[sn].active) {
      this.handleStripTouch(sn, payload).catch(() => {});
    }
  }

  onAlive(payload) {
    const { serialNumber: sn, keys } = payload;
    this.serialNumber = sn;

    keys.forEach((key) => {
      key.serialNumber = sn;   // per-device isolation
      this.keyData[key.uid] = key;
      logger.info('ALIVE key: ' + key.cid + ' keyType=' + this.getKeyType(key) + ' width=' + key.width);

      const cid = key.cid;

      // Initialize based on key type
      if (key.cid === 'com.dylanL.maccontrol.caffeinate') {
        this.renderCaffeinateButton(sn, key).catch(() => {});
        setTimeout(() => this.renderCaffeinateButton(sn, key).catch(() => {}), 600);
      } else if (String(this.getKeyType(key) || '').toLowerCase() === 'multistate') {
        this.initMultistateKey(sn, key);
      }

      if (cid === STRIP_CID) {
        // directDraw page becomes active on tap; FlexDesigner re-fires alive then.
        // Drawing here (with retries) paints the full-width bar instead of a black page.
        this.enterStrip(sn, key);
        return;
      }

      // Initialize chart keys and overview
      switch (cid) {
        case 'com.dylanL.maccontrol.overview':
          this.updateOverview().catch(() => {});
          break;
        case 'com.dylanL.maccontrol.systeminfo':
          this.updateSystemInfo().catch(() => {});
          break;
        case 'com.dylanL.maccontrol.cpu':
        case 'com.dylanL.maccontrol.memory':
        case 'com.dylanL.maccontrol.disk':
        case 'com.dylanL.maccontrol.network':
          // These use sendChartData — start collection
          break;
      }
    });

    // Start monitoring timers
    this.startTimers();
    // Do an initial collection
    this.collectAndSend().then(() => {
      this.updateOverview().catch(() => {});
    }).catch(() => {});

    logger.info('Mac Control Center plugin alive');
  }

  onDead(payload) {
    const { serialNumber: sn, keys } = payload;
    keys.forEach((key) => {
      delete this.keyData[key.uid];
      if (key.cid === STRIP_CID) this.exitStrip(sn);
    });
    // If no keys left, stop timers
    if (Object.keys(this.keyData).length === 0) {
      this.stopTimers();
    }
  }

  onData(payload) {
    const { serialNumber: sn, data } = payload;
    const key = data.key;
    const cid = key.cid;
    const uid = key.uid;

    // Interaction debug log for troubleshooting
    logger.debug('Key pressed: ' + cid + ' uid=' + uid);

    // Control Strip entry key: tap -> enter full-width directDraw page
    if (cid === STRIP_CID) {
      this.enterStrip(sn, key);
      return { status: 'success', message: 'Strip entered' };
    }

    // --- Monitor keys: cycle or refresh ---
    switch (cid) {
      case 'com.dylanL.maccontrol.overview':
        this.updateOverview().catch(() => {});
        return { status: 'success', message: 'Overview refreshed' };

      case 'com.dylanL.maccontrol.cpu':
      case 'com.dylanL.maccontrol.memory':
      case 'com.dylanL.maccontrol.disk':
      case 'com.dylanL.maccontrol.network':
        // Chart keys are pure display (like built-in performance chart) — clicks do nothing
        return { status: 'success', message: 'Chart key (no interaction)' };

      case 'com.dylanL.maccontrol.systeminfo':
        this.updateSystemInfo().catch(() => {});
        return { status: 'success', message: 'System info refreshed' };

      // --- Power actions ---
      case 'com.dylanL.maccontrol.sleep':
        this.snackbar(sn, 'Sleeping...', 'info');
        power.sleepNow().catch(() => {});
        return { status: 'success', message: 'Sleep triggered' };

      case 'com.dylanL.maccontrol.lock':
        this.snackbar(sn, 'Locking screen...', 'info');
        power.lockScreen().catch(() => {});
        return { status: 'success', message: 'Lock triggered' };

      case 'com.dylanL.maccontrol.shutdown':
      case 'com.dylanL.maccontrol.restart':
      case 'com.dylanL.maccontrol.emptytrash':
        return this.handleDangerousAction(sn, key, data);

      case 'com.dylanL.maccontrol.caffeinate':
        return this.handleCaffeinate(sn, key);

      // --- Toggles ---
      case 'com.dylanL.maccontrol.darkmode':
        return this.handleToggle(sn, key, 'darkmode');

      case 'com.dylanL.maccontrol.wifi':
        return this.handleToggle(sn, key, 'wifi');

      case 'com.dylanL.maccontrol.stage':
        return this.handleToggle(sn, key, 'stage');

      // --- Actions ---
      case 'com.dylanL.maccontrol.screenshot':
        return this.handleScreenshot(sn, data);


      default:
        return { status: 'success', message: 'OK' };
    }
  }

  onDeviceStatus(devices) {
    devices.forEach((device) => {
      if (device.status === 'connected') {
        logger.info(`Device connected: ${device.serialNumber}`);
        this.serialNumber = device.serialNumber;
        // Restore state and restart timers
        this.startTimers();
        // Re-init multistate keys
        for (const uid of Object.keys(this.keyData)) {
          const key = this.keyData[uid];
          if (String(this.getKeyType(key) || '').toLowerCase() === 'multistate') {
            this.initMultistateKey(this.serialNumber, key);
          }
        }
      } else if (device.status === 'disconnected') {
        logger.info(`Device disconnected: ${device.serialNumber}`);
        this.stopTimers();
      }
    });
  }

  onConfigUpdated(payload) {
    if (payload && payload.config) {
      this.config = { ...this.config, ...payload.config };
      // Restart timers with new interval
      if (this.monitorTimer) {
        this.startTimers();
      }
    }
  }

  onStop() {
    try {
      if (power.isCaffeinating()) power.stopCaffeinate();
    } catch (_) {}
  }

  // ============================================================
  // Start: register events and launch
  // ============================================================
  start() {
    plugin.start();

    // Cache system info on start
    systemCollector.collect().then((info) => {
      this.systemInfo = info;
    }).catch(() => {});

    plugin.on('device.touch', (payload) => this.onTouch(payload));

    plugin.on('plugin.alive', (payload) => this.onAlive(payload));

    plugin.on('plugin.dead', (payload) => this.onDead(payload));

    plugin.on('plugin.data', (payload) => this.onData(payload));

    plugin.on('device.status', (devices) => this.onDeviceStatus(devices));

    plugin.on('plugin.config.updated', (payload) => this.onConfigUpdated(payload));

    // Clean up our own caffeinate child on plugin stop (prevents orphan processes
    // that keep the system in caffeinate mode after the plugin exits)
    plugin.on('plugin.stop', () => this.onStop());
    plugin.on('plugin.unload', () => this.onStop());

    logger.info('Mac Control Center plugin loaded');
  }
}

// Touch events while the strip (directDraw page) is active
const MODULE_TYPE = { cpu: 'data', mem: 'data', disk: 'data', net: 'data', sleep: 'button', lock: 'button', caffeinate: 'button', darkmode: 'button', wifi: 'button', stage: 'button' };

const macPlugin = new MacControlPlugin();
macPlugin.start();
