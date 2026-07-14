#!/usr/bin/env node
/**
 * Generates the Windows app icon (build/icon.ico) from public/logo.png.
 *
 * electron-builder reads build/icon.ico to brand the packaged .exe and the NSIS
 * installer; the dev window also loads it for a crisp taskbar icon. Re-run this
 * whenever public/logo.png changes:  npm run data:icon
 */
const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico').default;

const root = path.resolve(__dirname, '..', '..');
const src = path.join(root, 'public', 'logo.png');
const out = path.join(root, 'build', 'icon.ico');

if (!fs.existsSync(src)) {
  console.error(`[app-icon] source not found: ${src}`);
  process.exit(1);
}

pngToIco(src)
  .then((buf) => {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
    const count = buf.readUInt16LE(4);
    const sizes = [];
    for (let i = 0; i < count; i++) {
      const o = 6 + i * 16;
      sizes.push(`${buf[o] || 256}x${buf[o + 1] || 256}`);
    }
    console.log(`[app-icon] wrote ${path.relative(root, out)} (${(buf.length / 1024).toFixed(1)} KB) — ${sizes.join(', ')}`);
  })
  .catch((err) => {
    console.error('[app-icon] failed:', err.message);
    process.exit(1);
  });
