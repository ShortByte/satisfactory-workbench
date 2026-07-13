/**
 * Launches Electron with a clean environment.
 *
 * Some shells/sandboxes export `ELECTRON_RUN_AS_NODE=1`, which forces the
 * Electron binary to behave as a plain Node.js runtime — `require('electron')`
 * then yields `undefined` for `app`, `BrowserWindow`, etc. and the app crashes
 * on startup. Electron decides this at process launch from the env var, so it
 * cannot be fixed from inside main.ts; we strip the var here before spawning.
 */
const { spawn } = require('node:child_process');

// In a plain Node context, requiring the electron package returns the path to
// the Electron executable (a string).
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});

child.on('close', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('Failed to launch Electron:', err);
  process.exit(1);
});
