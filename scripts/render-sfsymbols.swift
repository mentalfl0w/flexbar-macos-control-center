#!/usr/bin/env swift
// render-sfsymbols.swift
// Renders SF Symbols to 48x48 white PNG icons for the Flexbar plugin.
// Usage: swift scripts/render-sfsymbols.swift  (run from project root)
// Output: com.dylanL.maccontrol.plugin/resources/icons/*.png

import AppKit
import Foundation

func renderSFSymbol(name: String, pointSize: CGFloat, color: NSColor, outputSize: Int, outputPath: String) {
    let config = NSImage.SymbolConfiguration(pointSize: pointSize, weight: .regular)
    guard let baseImage = NSImage(systemSymbolName: name, accessibilityDescription: nil),
          let image = baseImage.withSymbolConfiguration(config) else {
        print("  [SKIP] Symbol not found: \(name)")
        return
    }
    let targetSize = NSSize(width: outputSize, height: outputSize)
    let rendered = NSImage(size: targetSize)
    rendered.lockFocus()
    let scale = min(targetSize.width / image.size.width, targetSize.height / image.size.height) * 0.8
    let w = image.size.width * scale
    let h = image.size.height * scale
    image.draw(in: NSRect(x: (targetSize.width - w) / 2, y: (targetSize.height - h) / 2, width: w, height: h))
    color.set()
    NSRect(origin: .zero, size: targetSize).fill(using: .sourceAtop)
    rendered.unlockFocus()
    guard let tiffData = rendered.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiffData),
          let png = rep.representation(using: .png, properties: [:]) else {
        print("  [FAIL] Could not create PNG for: \(name)")
        return
    }
    let url = URL(fileURLWithPath: outputPath)
    do {
        try png.write(to: url)
        print("  [OK] \(name) -> \(outputPath)")
    } catch {
        print("  [FAIL] Write error for \(name): \(error)")
    }
}

// Determine output directory relative to this script
let scriptDir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let projectRoot = scriptDir.deletingLastPathComponent()
let outputDir = projectRoot
    .appendingPathComponent("com.dylanL.maccontrol.plugin")
    .appendingPathComponent("resources")
    .appendingPathComponent("icons")

// Create output directory if needed
try? FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

// Icon mapping: SF Symbol name -> output filename
let icons: [(String, String)] = [
    ("power",              "power.png"),
    ("moon.fill",          "sleep.png"),
    ("moon.zzz.fill",      "caffeinate.png"),
    ("lock.fill",          "lock.png"),
    ("wifi",               "wifi_on.png"),
    ("wifi.slash",         "wifi_off.png"),
    ("sun.max.fill",       "lightmode.png"),
    ("moon.stars.fill",    "darkmode.png"),
    ("bolt.fill",          "power_source.png"),
    ("cpu",                "cpu.png"),
    ("memorychip",         "memory.png"),
    ("internaldrive.fill", "disk.png"),
    ("network",            "network.png"),
    ("camera.fill",        "screenshot.png"),
    ("trash.fill",         "trash.png"),
    ("rectangle.dock",     "stage_manager.png"),
    ("desktopcomputer",    "mac_mini.png"),
    ("gearshape.fill",     "settings.png"),
    ("arrow.clockwise",    "restart.png"),
]

print("Rendering \(icons.count) SF Symbols to \(outputDir.path)...")
for (symbol, filename) in icons {
    let outputPath = outputDir.appendingPathComponent(filename).path
    renderSFSymbol(name: symbol, pointSize: 20, color: NSColor.white, outputSize: 48, outputPath: outputPath)
}
print("Done.")
