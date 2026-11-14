/**
 * scripts/smoke-pack.js — Electron smoke test for the v0.11.0
 * file pack sending (P3).
 *
 * Run: ELECTRON_DISABLE_SANDBOX=1 xvfb-run -a ./node_modules/.bin/electron scripts/smoke-pack.js
 *
 * Covers: scan classification (include / skip reasons), excluded
 * dirs and secret names, per-file and whole-pack caps, binary
 * sniff at build time, subset selection, authorization gates,
 * and pack window creation. Exits 0 when all pass.
 */
'use strict';

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const m = require('../main.js');

const ROOT = '/tmp/smoke-pack';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log('  PASS ' + name);
  } else {
    failed++;
    failures.push(name);
    console.log('  FAIL ' + name + (extra ? ' — ' + extra : ''));
  }
}

function writeFile(rel, content) {
  const full = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

async function main() {
  await app.whenReady();
  const orig = {
    authorizedFolders: m.config.get('authorizedFolders'),
    blockedFolders: m.config.get('blockedFolders'),
  };
  fs.rmSync(ROOT, { recursive: true, force: true });

  // Fixture tree.
  writeFile('app/Controllers/Shop.php', "<?php\nnamespace App\\Controllers;\nclass Shop extends BaseController {}\n");
  writeFile('app/Config/App.php', "<?php\nnamespace Config;\nclass App extends \\CodeIgniter\\Config\\BaseConfig {}\n");
  writeFile('app/Models/ProductModel.php', "<?php\nnamespace App\\Models;\nclass ProductModel extends \\CodeIgniter\\Model {}\n");
  writeFile('public/index.php', "<?php\n// front controller\n");
  writeFile('README.md', '# smoke pack\n');
  writeFile('.env', "database.default.password = 'top-secret'\n");
  writeFile('.env.example', "database.default.password = ''\n");
  writeFile('composer.json', '{"name": "smoke/pack"}');
  writeFile('composer.lock', '{"packages": []}');
  writeFile('vendor/autoload.php', "<?php\n// autoloader — must be excluded\n");
  writeFile('node_modules/x/index.js', "console.log('must be excluded');\n");
  writeFile('writable/logs/log-2026-11-14.log', "log line\n");
  writeFile('writable/cache/page.html', "<html></html>\n");
  writeFile('big.php', '<?php\n' + 'x'.repeat(200 * 1024));
  writeFile('logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  writeFile('secret-key.pem', '-----BEGIN PRIVATE KEY-----\n');
  writeFile('app.min.js', 'var a=1;\n');
  const nulTxt = Buffer.concat([Buffer.from('hello '), Buffer.from([0]), Buffer.from(' world')]);
  writeFile('notes.txt', nulTxt);
  // Six ~100 KB files to trip the 512 KB whole-pack cap.
  for (let i = 1; i <= 6; i++) {
    writeFile(`bulk${i}.txt`, 'b'.repeat(100 * 1024));
  }

  m.config.update({ authorizedFolders: [ROOT], blockedFolders: [] });

  console.log('== scan classification ==');
  const scan = m.scanPackFiles(ROOT);
  check('scan ok', scan.ok === true);
  const byRel = new Map(scan.files.map((f) => [f.rel, f]));
  const included = scan.files.filter((f) => f.status === 'include').map((f) => f.rel);
  for (const want of ['app/Controllers/Shop.php', 'app/Config/App.php', 'app/Models/ProductModel.php', 'public/index.php', 'README.md', '.env.example', 'composer.json', 'composer.lock', 'notes.txt']) {
    check('includes ' + want, included.includes(want));
  }
  for (const gone of ['vendor/autoload.php', 'node_modules/x/index.js', 'writable/logs/log-2026-11-14.log', 'writable/cache/page.html']) {
    check('excluded dir file absent: ' + gone, !byRel.has(gone));
  }
  check('.env denied', byRel.get('.env') && byRel.get('.env').status === 'skip' && /密钥/.test(byRel.get('.env').reason));
  check('secret-key.pem denied', byRel.get('secret-key.pem') && byRel.get('secret-key.pem').status === 'skip');
  check('big.php too large', byRel.get('big.php') && byRel.get('big.php').status === 'skip' && /太大/.test(byRel.get('big.php').reason));
  check('logo.png not text', byRel.get('logo.png') && byRel.get('logo.png').status === 'skip');
  check('app.min.js skipped', byRel.get('app.min.js') && byRel.get('app.min.js').status === 'skip' && /压缩/.test(byRel.get('app.min.js').reason));

  console.log('== build: content + binary sniff + whole-pack cap ==');
  const built = m.buildFilePack(ROOT, []);
  check('build ok', built.ok === true);
  check('pack has tree + contents', built.pack.includes('# 文件包：smoke-pack') && built.pack.includes('## app/Controllers/Shop.php') && built.pack.includes('class Shop extends BaseController') && built.pack.includes('## 文件清单'));
  check('pack has skipped section', built.pack.includes('## 被跳过的文件') && built.pack.includes('.env'));
  check('notes.txt skipped as binary at build', built.skipped.some((s) => s.rel === 'notes.txt' && /二进制/.test(s.reason)));
  const capSkips = built.skipped.filter((s) => /总量超过/.test(s.reason));
  check('whole-pack cap trips', capSkips.length >= 1 && built.totalBytes <= 512 * 1024, 'totalBytes=' + built.totalBytes);
  check('pack contains no secret', !built.pack.includes('top-secret'));

  console.log('== subset selection ==');
  const sub = m.buildFilePack(ROOT, ['app/Controllers/Shop.php', 'README.md']);
  check('subset builds only those two', sub.ok === true && sub.included.length === 2 && sub.included.some((f) => f.rel === 'README.md') && !sub.pack.includes('class ProductModel'));

  console.log('== authorization gates ==');
  const outside = m.scanPackFiles('/tmp');
  check('outside authorized folder refused', outside.ok === false && outside.reason === 'not-authorized');
  const missing = m.scanPackFiles(path.join(ROOT, 'no-such-dir'));
  check('authorized but missing folder', missing.ok === false && missing.reason === 'missing-folder');

  console.log('== pack window ==');
  const win = m.createPackWindow();
  check('pack window created', !!win && !win.isDestroyed());
  win.hide();

  m.config.update({
    authorizedFolders: orig.authorizedFolders,
    blockedFolders: orig.blockedFolders,
  });

  console.log(`\n${passed} passed, ${failed} failed${failures.length ? ': ' + failures.join('; ') : ''}`);
  process.exit(failed ? 1 : 0);
}

setTimeout(() => {
  console.error('smoke-pack timed out');
  process.exit(2);
}, 90000);

main().catch((err) => {
  console.error('smoke-pack crashed:', err && err.stack ? err.stack : err);
  process.exit(2);
});
