/**
 * E2E test for the oblivious text CRDT sync demo.
 *
 * Uses the geckodriver built alongside the custom Firefox (--enable-geckodriver)
 * so the binary validation matches. Geckodriver launches Firefox itself.
 *
 * The test starts sync-server.js (WebSocket relay + HTTP) and opens
 * sync-demo.html which loads two editor iframes connected via WebSocket.
 *
 * Run: node test/e2e_sync_test.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { Builder } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';

const DEMO_DIR = path.resolve(import.meta.dirname, '..', 'demo');
const TIMEOUT = 30_000;

function findOnPath(name) {
  try {
    return execSync(`which ${name}`, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function findBuildDir() {
  const home = process.env.HOME || '/home/' + process.env.USER;
  const candidates = fs.readdirSync(path.join(home, 'firefox'))
    .filter(d => d.startsWith('obj-'))
    .map(d => path.join(home, 'firefox', d));
  return candidates[0] || null;
}

function findFirefox() {
  if (process.env.FIREFOX_BINARY) return process.env.FIREFOX_BINARY;
  const buildDir = findBuildDir();
  if (buildDir) {
    const p = path.join(buildDir, 'dist', 'bin', 'firefox');
    if (fs.existsSync(p)) return p;
  }
  const onPath = findOnPath('firefox');
  if (onPath) return onPath;
  throw new Error('firefox not found -- set FIREFOX_BINARY or build in ~/firefox');
}

function findGeckodriver() {
  if (process.env.GECKODRIVER) return process.env.GECKODRIVER;
  const buildDir = findBuildDir();
  if (buildDir) {
    const candidates = [
      path.join(buildDir, 'dist', 'bin', 'geckodriver'),
      path.join(buildDir, 'x86_64-unknown-linux-gnu', 'release', 'geckodriver'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  }
  const onPath = findOnPath('geckodriver');
  if (onPath) return onPath;
  throw new Error('geckodriver not found -- set GECKODRIVER or build with --enable-geckodriver');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitUntil(driver, predicate, label, timeoutMs = TIMEOUT) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await driver.executeScript(predicate);
      if (result) return result;
    } catch {}
    await sleep(300);
  }
  throw new Error(`${label}: timed out after ${timeoutMs}ms`);
}

function startSyncServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(DEMO_DIR, 'sync-server.js');
    const port = 9090 + Math.floor(Math.random() * 900);
    const proc = spawn(process.execPath, [serverPath], {
      env: { ...process.env, PORT: String(port) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let started = false;
    proc.stdout.on('data', (data) => {
      const line = data.toString();
      if (!started && line.includes('Sync server')) {
        started = true;
        resolve({ proc, port });
      }
    });
    proc.stderr.on('data', (data) => {
      if (!started) {
        reject(new Error(`sync-server stderr: ${data}`));
      }
    });
    proc.on('error', reject);
    setTimeout(() => {
      if (!started) reject(new Error('sync-server startup timeout'));
    }, 10_000);
  });
}

// Helpers to run scripts in a specific iframe
async function inFrame(driver, frameIndex, scriptFn) {
  await driver.switchTo().frame(frameIndex);
  try {
    return await scriptFn();
  } finally {
    await driver.switchTo().defaultContent();
  }
}

async function execInFrame(driver, frameIndex, script) {
  return inFrame(driver, frameIndex, () => driver.executeScript(script));
}

let passed = 0;
let failed = 0;

function ok(msg) {
  passed++;
  console.log(`  PASS: ${msg}`);
}

function fail(msg) {
  failed++;
  console.log(`  FAIL: ${msg}`);
}

function assert(cond, msg) {
  if (cond) ok(msg);
  else fail(msg);
}

async function run() {
  console.log('Oblivious Text CRDT -- E2E Test\n');

  const firefoxPath = findFirefox();
  const geckodriverPath = findGeckodriver();
  console.log(`Firefox: ${firefoxPath}`);
  console.log(`Geckodriver: ${geckodriverPath}`);

  console.log('Starting sync server...');
  const { proc: serverProc, port } = await startSyncServer();
  console.log(`  Sync server on port ${port}`);
  const baseUrl = `http://127.0.0.1:${port}`;

  let driver;
  try {
    const options = new firefox.Options()
      .setBinary(firefoxPath)
      .addArguments('-headless')
      .setPreference('dom.oblivious.enabled', true)
      .setPreference('dom.oblivious.debug', true)
      .setPreference('toolkit.startup.max_resumed_crashes', -1)
      .setPreference('browser.shell.checkDefaultBrowser', false)
      .setPreference('browser.startup.homepage_override.mstone', 'ignore')
      .setPreference('datareporting.policy.dataSubmissionEnabled', false)
      .setPreference('toolkit.telemetry.reportingpolicy.firstRun', false);

    const service = new firefox.ServiceBuilder(geckodriverPath);

    driver = await new Builder()
      .forBrowser('firefox')
      .setFirefoxService(service)
      .setFirefoxOptions(options)
      .build();

    console.log('Firefox started.\n');

    await driver.get(`${baseUrl}/sync-demo.html`);

    console.log('Waiting for editors to initialize...');
    await sleep(3000);

    // Wait for editor A status (shown in parent page via postMessage)
    await waitUntil(driver,
      `return document.getElementById('status-a')?.textContent?.includes('ready')`,
      'Editor A ready', 60000);

    // Wait for sync: editor B should have content after WebSocket sync
    await sleep(2000);

    const statusA = await driver.executeScript(
      `return document.getElementById('status-a')?.textContent || 'not found'`);
    console.log(`  Status A: ${statusA}`);

    // -------------------------------------------------------------------
    // Test 1: Seeded content and sync
    // -------------------------------------------------------------------
    console.log('\nTest 1: Seeded content and sync verification');

    const seedA = await execInFrame(driver, 0, `
      const buf = window._crdt.getRenderBuffer();
      const vals = buf.map(v => v.debugReveal()).filter(v => v !== null);
      return { count: buf.length, vals };
    `);

    // Wait for B to sync
    let seedB;
    const syncDeadline = Date.now() + 15000;
    while (Date.now() < syncDeadline) {
      seedB = await execInFrame(driver, 1, `
        const buf = window._crdt.getRenderBuffer();
        const vals = buf.map(v => v.debugReveal()).filter(v => v !== null);
        return { count: buf.length, vals };
      `);
      if (seedB.count >= 5) break;
      await sleep(500);
    }

    assert(seedA.count === 5,
      `Editor A has 5 elements (got ${seedA.count})`);
    assert(seedA.vals.join('') === 'Hello',
      `Editor A shows "Hello" (got "${seedA.vals.join('')}")`);
    assert(JSON.stringify(seedA.vals) === JSON.stringify(seedB.vals),
      `Editor B synced "Hello" (got "${seedB.vals.join('')}")`);

    // -------------------------------------------------------------------
    // Test 2: Type and verify content
    // -------------------------------------------------------------------
    console.log('\nTest 2: Type "abc" in A, verify content');

    const typeResult = await execInFrame(driver, 0, `
      const oc = window._oc;
      const crdt = window._crdt;
      const insertAction = oc.fromByte(1);
      const visBefore = crdt.getRenderBuffer().filter(e => e.debugReveal() !== null).length;
      let cursor = oc.createInt(visBefore);
      for (const ch of 'abc') {
        const kc = oc.createInt(ch.charCodeAt(0));
        const result = crdt.obliviousEdit(kc, insertAction, cursor);
        cursor = result.newCursor;
      }
      const bufA = crdt.getRenderBuffer();
      return bufA.map(v => v.debugReveal()).filter(v => v !== null);
    `);

    assert(typeResult.join('') === 'Helloabc',
      `Editor A has "Helloabc" (got "${typeResult.join('')}")`);

    // -------------------------------------------------------------------
    // Test 3: Backspace
    // -------------------------------------------------------------------
    console.log('\nTest 3: Backspace 2 in A');

    const bsResult = await execInFrame(driver, 0, `
      const oc = window._oc;
      const crdt = window._crdt;
      const bsAction = oc.fromByte(2);
      const visBefore = crdt.getRenderBuffer().filter(e => e.debugReveal() !== null).length;
      let cursor = oc.createInt(visBefore);
      for (let i = 0; i < 2; i++) {
        const kc = oc.createInt(0);
        const result = crdt.obliviousEdit(kc, bsAction, cursor);
        cursor = result.newCursor;
      }
      return crdt.getRenderBuffer().map(v => v.debugReveal()).filter(v => v !== null);
    `);

    assert(bsResult.join('') === 'Helloa',
      `Editor A has "Helloa" after 2 backspaces (got "${bsResult.join('')}")`);

    // -------------------------------------------------------------------
    // Test 4: Performance -- per-keystroke latency and handle counts
    // -------------------------------------------------------------------
    console.log('\nTest 4: Performance (30 keystrokes)');

    const perfResult = await execInFrame(driver, 0, `
      const oc = window._oc;
      const crdt = window._crdt;
      const text = 'abcdefghijklmnopqrstuvwxyz1234';
      const insertAction = oc.fromByte(1);

      function localGc() {
        const live = crdt.collectLiveHandleIds();
        oc.h_freeAboveWatermark(live, 0);
      }

      const visCount = crdt.getRenderBuffer().filter(e => e.debugReveal() !== null).length;
      let cursor = oc.createInt(visCount);

      const timings = [];
      const handleCounts = [];
      const elementCounts = [];

      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const kc = oc.createInt(ch.charCodeAt(0));
        const t0 = performance.now();
        const result = crdt.obliviousEdit(kc, insertAction, cursor);
        const t1 = performance.now();
        cursor = result.newCursor;
        localGc();
        timings.push(t1 - t0);
        handleCounts.push(oc.h_handleCount());
        elementCounts.push(crdt.getRenderBuffer().length);
      }

      return { timings, handleCounts, elementCounts };
    `);

    const { timings, handleCounts, elementCounts } = perfResult;
    const meanMs = timings.reduce((a, b) => a + b, 0) / timings.length;
    const maxMs = Math.max(...timings);
    const minMs = Math.min(...timings);
    const first5 = timings.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const last5 = timings.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const slowdown = first5 > 0 ? last5 / first5 : 1.0;
    const totalMs = timings.reduce((a, b) => a + b, 0);

    console.log(`  Timing: mean=${meanMs.toFixed(1)}ms, min=${minMs.toFixed(1)}ms, max=${maxMs.toFixed(1)}ms, total=${(totalMs/1000).toFixed(1)}s`);
    console.log(`  First 5 avg: ${first5.toFixed(1)}ms, Last 5 avg: ${last5.toFixed(1)}ms`);
    console.log(`  Slowdown ratio (last5/first5): ${slowdown.toFixed(2)}x`);

    console.log('\n  Per-keystroke:');
    const perfText = 'abcdefghijklmnopqrstuvwxyz1234';
    for (let i = 0; i < timings.length; i++) {
      const bar = '#'.repeat(Math.min(Math.round(timings[i] / 100), 60));
      console.log(`    [${(i+1).toString().padStart(2)}] '${perfText[i]}' ${timings[i].toFixed(0).padStart(6)}ms  handles=${handleCounts[i].toString().padStart(6)}  elems=${elementCounts[i].toString().padStart(4)}  ${bar}`);
    }

    const maxHandles = Math.max(...handleCounts);
    const lastHandles = handleCounts[handleCounts.length - 1];
    const firstHandles = handleCounts[0];
    const firstElems = elementCounts[0];
    const lastElems = elementCounts[elementCounts.length - 1];
    console.log(`\n  Handles: first=${firstHandles}, max=${maxHandles}, final=${lastHandles}`);
    console.log(`  CRDT elements: first=${firstElems}, last=${lastElems}, growth=${lastElems - firstElems}`);

    assert(slowdown < 5.0,
      `Slowdown ratio ${slowdown.toFixed(2)}x < 5x threshold`);
    assert(maxMs < 30000,
      `Max keystroke ${maxMs.toFixed(0)}ms < 30s threshold`);

    const elemGrowth = lastElems - firstElems;
    assert(elemGrowth === timings.length - 1,
      `Element growth is linear: ${elemGrowth} for ${timings.length - 1} keystrokes`);

    assert(lastHandles < 5000,
      `Handle count bounded after local GC: ${lastHandles} < 5000`);

    // -------------------------------------------------------------------
    // Test 5: Handle GC -- watermark-based cleanup works
    // -------------------------------------------------------------------
    console.log('\nTest 5: Handle GC (watermark cleanup)');

    const gcResult = await execInFrame(driver, 0, `
      const oc = window._oc;
      const before = oc.h_handleCount();
      const watermark = oc.h_watermark();

      for (let i = 0; i < 100; i++) {
        oc.h_createInt(i);
      }
      const afterCreate = oc.h_handleCount();

      oc.h_freeAboveWatermark(new Uint32Array([]), watermark);
      const afterGc = oc.h_handleCount();

      return { before, afterCreate, afterGc };
    `);

    console.log(`  Before: ${gcResult.before}, After create 100: ${gcResult.afterCreate}, After GC: ${gcResult.afterGc}`);
    assert(gcResult.afterCreate >= gcResult.before + 100,
      `Creating 100 handles grew count by >= 100`);
    assert(gcResult.afterGc <= gcResult.before,
      `GC freed all throwaway handles (${gcResult.afterGc} <= ${gcResult.before})`);

    // -------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------
    console.log(`\n--- Results ---`);
    console.log(`${passed} passed, ${failed} failed`);
    if (failed > 0) process.exitCode = 1;

  } catch (err) {
    console.error(`\nTest error: ${err.message || err}`);
    if (err.stack) console.error(err.stack);
    process.exitCode = 1;
  } finally {
    if (driver) {
      try { await driver.quit(); } catch {}
    }
    serverProc.kill();
  }
}

run();
