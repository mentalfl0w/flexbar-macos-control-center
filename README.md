# macOS Control Center — Flexbar Plugin

System control & monitoring for macOS (26+, Apple Silicon) on your Flexbar.

## Features

- **Overview** — live CPU / memory / disk / network dashboard (updates every 10s)
- **Control Strip** — tap the entry key to open a full-width bar with monitoring blocks and one-tap controls (Sleep, Lock, Caffeinate, Dark Mode, WiFi, Stage Manager)
- **Standalone keys** — chart keys (CPU/Memory/Disk/Network), power keys (Sleep/Lock/Restart/Shut Down with double-tap confirm, Caffeinate with real system-state indicator), toggle keys (Dark Mode/WiFi/Stage Manager), and utility keys (Screenshot, Empty Trash with double-tap confirm, System Info)

## Details

- All data comes from built-in macOS commands (`/usr/bin/top`, `vm_stat`, `df`, `iostat`, `ioreg`, `pmset`, `networksetup`, `osascript`) — no third-party tools, no administrator rights
- Destructive actions (Restart / Shut Down / Empty Trash) require **two taps within 10 seconds** to confirm
- Caffeinate button reflects the **real system state** (any `caffeinate` process, including ones started outside the plugin)
- Screenshot and Empty Trash need one-time Screen Recording / Automation permission in System Settings

## Build

```bash
npm install
npm run build          # → com.dylanL.maccontrol.plugin/backend/plugin.cjs
```

## Development (with FlexDesigner running)

```bash
flexcli plugin link --path com.dylanL.maccontrol.plugin --uuid com.dylanL.maccontrol
npm run build          # rebuild after changes
# then restart from FlexDesigner plugin manager or:
flexcli plugin restart --uuid com.dylanL.maccontrol
```

## Packaging

```bash
flexcli plugin pack --path com.dylanL.maccontrol.plugin --output dist
```

Push a tag matching `manifest.json` version (e.g. `v1.0.0`) — GitHub Actions builds and attaches the `.flexplugin` to the release.

## License

GNU GPL v3.0 — see [LICENSE](LICENSE).
