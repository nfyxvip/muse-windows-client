/**
 * scripts/smoke-runner.js — Electron smoke test for the v0.9.0 task runner.
 *
 * Run: ELECTRON_DISABLE_SANDBOX=1 xvfb-run -a ./node_modules/.bin/electron scripts/smoke-runner.js
 *
 * Covers: task-package parsing (valid + 6 invalid shapes), whitelist
 * gate, authorized/blocked folder gate, real execution (node + php),
 * failing steps, report building, and abort. Exits 0 when all pass.
 */
'use strict';

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const m = require('../main.js');

const TEST_DIR = '/tmp/smoke-runner';
const BLOCKED_DIR = path.join(TEST_DIR, 'blocked');

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

async function main() {
  await app.whenReady();
  const orig = {
    runnerEnabled: m.config.get('runnerEnabled'),
    runnerAllowedCommands: m.config.get('runnerAllowedCommands'),
    authorizedFolders: m.config.get('authorizedFolders'),
    blockedFolders: m.config.get('blockedFolders'),
  };
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(BLOCKED_DIR, { recursive: true });

  console.log('== parseTaskPackage ==');
  const good = m.parseTaskPackage(JSON.stringify({
    title: '检查 PHP 版本',
    steps: [
      { cmd: 'php', args: ['-v'] },
      { cmd: 'node', args: ['--version'] },
    ],
  }));
  check('valid package parses', good.ok && good.title === '检查 PHP 版本' && good.steps.length === 2 && good.steps[0].args[0] === '-v');
  check('invalid JSON rejected', !m.parseTaskPackage('{not json').ok);
  check('empty steps rejected', !m.parseTaskPackage(JSON.stringify({ title: 'x', steps: [] })).ok);
  check('cmd with path rejected', !m.parseTaskPackage(JSON.stringify({ steps: [{ cmd: '../bin/php', args: [] }] })).ok);
  check('cmd with shell chars rejected', !m.parseTaskPackage(JSON.stringify({ steps: [{ cmd: 'php; rm -rf /', args: [] }] })).ok);
  check('non-array args rejected', !m.parseTaskPackage(JSON.stringify({ steps: [{ cmd: 'php', args: '-v' }] })).ok);
  const tooMany = { steps: Array.from({ length: 21 }, () => ({ cmd: 'php', args: ['-v'] })) };
  check('21 steps rejected', !m.parseTaskPackage(JSON.stringify(tooMany)).ok);
  const noTitle = m.parseTaskPackage(JSON.stringify({ steps: [{ cmd: 'php', args: ['-v'] }] }));
  check('missing title gets default', noTitle.ok && noTitle.title === '未命名任务');

  console.log('== whitelist gate ==');
  m.config.update({ runnerAllowedCommands: ['php', 'composer', 'git', 'npm', 'node', 'npx'] });
  check('whitelisted steps pass', m.checkRunnerSteps([{ cmd: 'php', args: [] }, { cmd: 'git', args: ['status'] }]).ok);
  const blocked = m.checkRunnerSteps([{ cmd: 'php', args: [] }, { cmd: 'rm', args: ['-rf', '/'] }]);
  check('rm is blocked', !blocked.ok && blocked.blocked.includes('rm'));

  console.log('== run gate ==');
  m.config.update({ runnerEnabled: false, authorizedFolders: [TEST_DIR], blockedFolders: [] });
  check('disabled runner refuses', m.checkRunnerRun(good, TEST_DIR).reason === 'disabled');
  m.config.update({ runnerEnabled: true });
  check('authorized folder passes', m.checkRunnerRun(good, TEST_DIR).ok);
  check('outside folder refused', m.checkRunnerRun(good, '/tmp').reason === 'not-authorized');
  m.config.update({ blockedFolders: [BLOCKED_DIR] });
  check('blocked folder refused', m.checkRunnerRun(good, BLOCKED_DIR).reason === 'blocked');
  m.config.update({ blockedFolders: [] });
  check('missing folder refused', m.checkRunnerRun(good, path.join(TEST_DIR, 'gone')).reason === 'missing-folder');
  const badPkg = m.parseTaskPackage(JSON.stringify({ title: 'bad', steps: [{ cmd: 'rm', args: [] }] }));
  check('non-whitelisted package refused', m.checkRunnerRun(badPkg, TEST_DIR).reason === 'not-whitelisted');

  console.log('== real execution ==');
  const runPkg = m.parseTaskPackage(JSON.stringify({
    title: '冒烟测试',
    steps: [
      { cmd: 'node', args: ['--version'] },
      { cmd: 'php', args: ['-v'] },
      { cmd: 'node', args: ['-e', `require('fs').writeFileSync(${JSON.stringify(path.join(TEST_DIR, 'hello.txt'))}, 'hi-runner')`] },
    ],
  }));
  const outcome = await m.runTaskSteps(runPkg, TEST_DIR, () => {});
  check('3 steps run', outcome.results.length === 3 && !outcome.aborted);
  check('node --version ok + output', outcome.results[0].status === 'ok' && outcome.results[0].output.includes('v'));
  check('php -v ok + output', outcome.results[1].status === 'ok' && outcome.results[1].output.includes('PHP'));
  check('file written in cwd', fs.existsSync(path.join(TEST_DIR, 'hello.txt')) && fs.readFileSync(path.join(TEST_DIR, 'hello.txt'), 'utf8') === 'hi-runner');

  const failPkg = m.parseTaskPackage(JSON.stringify({
    title: '失败步骤',
    steps: [
      { cmd: 'node', args: ['-e', 'process.exit(3)'] },
      { cmd: 'php', args: [path.join(TEST_DIR, 'nope.php')] },
    ],
  }));
  const failOutcome = await m.runTaskSteps(failPkg, TEST_DIR, () => {});
  check('exit(3) recorded', failOutcome.results[0].status === 'failed' && failOutcome.results[0].exitCode === 3);
  check('missing php file fails', failOutcome.results[1].status === 'failed' && failOutcome.results[1].exitCode !== 0);

  console.log('== report ==');
  const report = m.buildRunnerReport(runPkg, TEST_DIR, outcome);
  check('report has title', report.includes('# 任务报告：冒烟测试'));
  check('report has step command', report.includes('node --version'));
  check('report has exit code', report.includes('退出码：0'));
  check('report has output', report.includes('PHP'));

  console.log('== abort ==');
  const slowPkg = m.parseTaskPackage(JSON.stringify({
    title: '慢任务',
    steps: [{ cmd: 'node', args: ['-e', 'setTimeout(()=>{}, 30000)'] }],
  }));
  const slowPromise = m.runTaskSteps(slowPkg, TEST_DIR, () => {});
  setTimeout(() => m.abortRunnerRun(), 500);
  const slowOutcome = await slowPromise;
  check('abort stops the run', slowOutcome.aborted === true);

  console.log('== runner window ==');
  const win = m.createRunnerWindow();
  check('runner window created', !!win && !win.isDestroyed());
  win.hide();

  // Restore the config the test changed.
  m.config.update({
    runnerEnabled: orig.runnerEnabled,
    runnerAllowedCommands: orig.runnerAllowedCommands,
    authorizedFolders: orig.authorizedFolders,
    blockedFolders: orig.blockedFolders,
  });

  console.log(`\n${passed} passed, ${failed} failed${failures.length ? ': ' + failures.join('; ') : ''}`);
  process.exit(failed ? 1 : 0);
}

setTimeout(() => {
  console.error('smoke-runner timed out');
  process.exit(2);
}, 90000);

main().catch((err) => {
  console.error('smoke-runner crashed:', err && err.stack ? err.stack : err);
  process.exit(2);
});
