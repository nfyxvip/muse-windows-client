/* Linux-only workaround for building the NSIS installer.
 *
 * electron-builder's NSIS target finishes the installer by RUNNING the
 * intermediate installer under Wine to extract the uninstaller exe.
 * On this VM Wine cannot run 32-bit PE files: the bundled Wine 11
 * toolset has no 32-bit support at all, and the system Wine 9.0
 * (wine64 only) cannot load the 32-bit ntdll.dll because the 32-bit
 * Wine libraries (wine32:i386) cannot be installed — the VM image
 * ships Hatch-patched amd64 libraries (e.g. libzstd1 +hatch1) whose
 * versions never match the i386 archive builds, so apt refuses.
 *
 * electron-builder already has an offline way to extract the
 * uninstaller from the installer file (UninstallerReader, used on
 * macOS Catalina). This script patches the installed
 * app-builder-lib so Linux builds use that offline path instead of
 * Wine. It is idempotent; run it again after `npm install` or after
 * node_modules is recreated. On Windows the patch is a no-op (the
 * condition only adds the Linux branch).
 *
 * Usage: npm run build:linux   (patch + full Windows build)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'app-builder-lib',
  'out',
  'targets',
  'nsis',
  'NsisTarget.js'
);

const before = 'if ((0, macosVersion_1.isMacOsCatalina)()) {';
const after =
  'if ((0, macosVersion_1.isMacOsCatalina)() || process.platform === "linux") {';

const text = fs.readFileSync(target, 'utf8');
if (text.includes(after)) {
  console.log('nsis linux patch: already applied');
  process.exit(0);
}
if (!text.includes(before)) {
  console.error('nsis linux patch: pattern not found in ' + target);
  process.exit(1);
}
fs.writeFileSync(target, text.replace(before, after));
console.log('nsis linux patch: applied (UninstallerReader on Linux instead of Wine)');
