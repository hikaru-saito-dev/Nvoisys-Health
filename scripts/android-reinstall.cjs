/**
 * Uninstalls the app if present (clears signature mismatch), then runs expo run:android.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = 'com.anonymous.myapp';

spawnSync('adb', ['uninstall', pkg], { stdio: 'inherit', cwd: root, shell: true });

const r = spawnSync('npx', ['expo', 'run:android'], { stdio: 'inherit', cwd: root, shell: true });
process.exit(r.status ?? 1);
