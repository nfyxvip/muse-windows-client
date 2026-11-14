/**
 * scripts/smoke-scheduler.js — Electron smoke test for the v0.10.0
 * scheduled runner tasks (P2).
 *
 * Run: ELECTRON_DISABLE_SANDBOX=1 xvfb-run -a ./node_modules/.bin/electron scripts/smoke-scheduler.js
 *
 * Covers: next-run math (daily + weekly), schedule text, due-window
 * + dedup + no-catch-up rules, end-to-end due execution with logging,
 * disabled tasks, and gate failures. Exits 0 when all pass.
 */
'use strict';

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const m = require('../main.js');

const TEST_DIR = '/tmp/smoke-scheduler';

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

function hhmm(d) {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function sameMinute(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate() && a.getHours() === b.getHours() && a.getMinutes() === b.getMinutes();
}

async function main() {
  await app.whenReady();
  const orig = {
    runnerEnabled: m.config.get('runnerEnabled'),
    runnerAllowedCommands: m.config.get('runnerAllowedCommands'),
    authorizedFolders: m.config.get('authorizedFolders'),
    blockedFolders: m.config.get('blockedFolders'),
    runnerScheduledTasks: m.config.get('runnerScheduledTasks'),
    runnerScheduleLog: m.config.get('runnerScheduleLog'),
  };
  fs.mkdirSync(TEST_DIR, { recursive: true });

  console.log('== next-run math ==');
  // 2026-11-15 is a Sunday, 2026-11-16 a Monday.
  const sun1000 = new Date(2026, 10, 15, 10, 0, 0);
  const mon0800 = new Date(2026, 10, 16, 8, 0, 0);
  const mon1000 = new Date(2026, 10, 16, 10, 0, 0);
  const daily0900 = { kind: 'daily', time: '09:00', weekday: 1 };
  check('daily: 08:00 -> today 09:00', sameMinute(m.nextRunnerRun(daily0900, new Date(2026, 10, 15, 8, 0, 0)), new Date(2026, 10, 15, 9, 0, 0)));
  check('daily: 10:00 -> tomorrow 09:00', sameMinute(m.nextRunnerRun(daily0900, sun1000), new Date(2026, 10, 16, 9, 0, 0)));
  const weeklyMon0900 = { kind: 'weekly', time: '09:00', weekday: 1 };
  check('weekly: Sun 10:00 -> Mon 09:00', sameMinute(m.nextRunnerRun(weeklyMon0900, sun1000), new Date(2026, 10, 16, 9, 0, 0)));
  check('weekly: Mon 08:00 -> today 09:00', sameMinute(m.nextRunnerRun(weeklyMon0900, mon0800), new Date(2026, 10, 16, 9, 0, 0)));
  check('weekly: Mon 10:00 -> next Mon 09:00', sameMinute(m.nextRunnerRun(weeklyMon0900, mon1000), new Date(2026, 10, 23, 9, 0, 0)));
  check('schedule text daily', m.runnerScheduleText(daily0900) === '每天 09:00');
  check('schedule text weekly', m.runnerScheduleText(weeklyMon0900) === '每周一 09:00');

  console.log('== due rules ==');
  const now = new Date();
  const dueTask = { id: 't1', name: 'due', enabled: true, kind: 'daily', time: hhmm(now), weekday: 1, cwd: TEST_DIR, package: { title: 'x', steps: [{ cmd: 'node', args: ['--version'] }] }, lastRunKey: '' };
  check('due now', m.isRunnerTaskDue(dueTask, now) === true);
  const occ = m.runnerOccurrenceFor(dueTask, now);
  const ranTask = { ...dueTask, lastRunKey: `${occ.getFullYear()}-${String(occ.getMonth() + 1).padStart(2, '0')}-${String(occ.getDate()).padStart(2, '0')} ${hhmm(occ)}` };
  check('same slot does not re-run', m.isRunnerTaskDue(ranTask, now) === false);
  check('disabled task not due', m.isRunnerTaskDue({ ...dueTask, enabled: false }, now) === false);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const oldTask = { ...dueTask, time: hhmm(twoHoursAgo) };
  check('2h-old slot is not caught up', m.isRunnerTaskDue(oldTask, now) === false);
  const futureTask = { ...dueTask, time: hhmm(new Date(now.getTime() + 60 * 60 * 1000)) };
  check('future task not due', m.isRunnerTaskDue(futureTask, now) === false);

  console.log('== end-to-end due execution ==');
  m.config.update({
    runnerEnabled: true,
    runnerAllowedCommands: ['php', 'composer', 'git', 'npm', 'node', 'npx'],
    authorizedFolders: [TEST_DIR],
    blockedFolders: [],
    runnerScheduledTasks: [dueTask],
    runnerScheduleLog: [],
  });
  const ran = await m.checkDueRunnerTasks(new Date());
  check('due task ran', ran.length === 1 && ran[0] === 't1');
  const log1 = m.config.get('runnerScheduleLog');
  check('run logged ok', log1.length === 1 && log1[0].ok === 1 && log1[0].total === 1 && log1[0].taskId === 't1');
  const tasksAfter = m.config.get('runnerScheduledTasks');
  check('lastRunKey recorded', tasksAfter.length === 1 && tasksAfter[0].lastRunKey !== '');
  const ran2 = await m.checkDueRunnerTasks(new Date());
  check('second check does not re-run', ran2.length === 0 && m.config.get('runnerScheduleLog').length === 1);

  console.log('== disabled + gate failure ==');
  const disabledTask = { ...dueTask, id: 't2', name: 'off', enabled: false };
  m.config.update({ runnerScheduledTasks: [disabledTask], runnerScheduleLog: [] });
  const ran3 = await m.checkDueRunnerTasks(new Date());
  check('disabled task skipped', ran3.length === 0 && m.config.get('runnerScheduleLog').length === 0);
  const badFolderTask = { ...dueTask, id: 't3', name: 'bad-folder', cwd: '/tmp' };
  m.config.update({ runnerScheduledTasks: [badFolderTask], runnerScheduleLog: [] });
  const ran4 = await m.checkDueRunnerTasks(new Date());
  check('unauthorized folder logged as failure', ran4.length === 1 && m.config.get('runnerScheduleLog').length === 1 && m.config.get('runnerScheduleLog')[0].ok === 0 && m.config.get('runnerScheduleLog')[0].error !== '');

  console.log('== runner window still works ==');
  const win = m.createRunnerWindow();
  check('runner window created', !!win && !win.isDestroyed());
  win.hide();

  // Restore the config the test changed.
  m.config.update({
    runnerEnabled: orig.runnerEnabled,
    runnerAllowedCommands: orig.runnerAllowedCommands,
    authorizedFolders: orig.authorizedFolders,
    blockedFolders: orig.blockedFolders,
    runnerScheduledTasks: orig.runnerScheduledTasks,
    runnerScheduleLog: orig.runnerScheduleLog,
  });

  console.log(`\n${passed} passed, ${failed} failed${failures.length ? ': ' + failures.join('; ') : ''}`);
  process.exit(failed ? 1 : 0);
}

setTimeout(() => {
  console.error('smoke-scheduler timed out');
  process.exit(2);
}, 90000);

main().catch((err) => {
  console.error('smoke-scheduler crashed:', err && err.stack ? err.stack : err);
  process.exit(2);
});
