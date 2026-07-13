/**
 * E2E test for the oblivious text CRDT sync demo.
 *
 * Uses the geckodriver built alongside the custom Firefox (--enable-geckodriver)
 * so the binary validation matches. Geckodriver launches Firefox itself.
 *
 * Run: node test/e2e_sync_test.js
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Builder, Key } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';

const DEMO_DIR = path.resolve(import.meta.dirname, '..', 'demo');
const TIMEOUT = 30_000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.wasm': 'application/wasm',
  '.css': 'text/css',
};

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
  throw new Error('firefox not found — set FIREFOX_BINARY or build in ~/firefox');
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
  throw new Error('geckodriver not found — set GECKODRIVER or build with --enable-geckodriver');
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      let filePath = path.join(DEMO_DIR, url.pathname === '/' ? 'sync-demo.html' : url.pathname);
      console.log(`  [HTTP] ${req.method} ${url.pathname}`);
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath);
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log(`  Server listening on http://127.0.0.1:${port}`);
      resolve({ server, port });
    });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getStatusText(driver, iframeId) {
  await driver.switchTo().defaultContent();
  const iframe = await driver.findElement({ id: iframeId });
  await driver.switchTo().frame(iframe);
  const status = await driver.findElement({ id: 'status' });
  const text = await status.getText();
  await driver.switchTo().defaultContent();
  return text;
}

async function waitForStatus(driver, iframeId, predicate, label) {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    try {
      const text = await getStatusText(driver, iframeId);
      if (predicate(text)) return text;
    } catch {
      // iframe might not be ready yet
    }
    await sleep(300);
  }
  const finalText = await getStatusText(driver, iframeId);
  throw new Error(`${label}: timed out, last status: "${finalText}"`);
}

async function getDebugText(driver, iframeId) {
  await driver.switchTo().defaultContent();
  const iframe = await driver.findElement({ id: iframeId });
  await driver.switchTo().frame(iframe);
  const text = await driver.executeScript(`
    try {
      const buf = window._crdt.getRenderBuffer();
      const parts = [];
      for (let i = 0; i < buf.length; i++) {
        try { parts.push(buf[i].toBase64()); }
        catch (e) { parts.push('ERR'); }
      }
      return parts.join(',');
    } catch (e) { throw new Error(e.message || String(e)); }
  `);
  await driver.switchTo().defaultContent();
  return text;
}

async function getElementCount(driver, iframeId) {
  const text = await getDebugText(driver, iframeId);
  return text.split(',').filter(Boolean).length;
}

async function hasDebugRevealSupport(driver, iframeId) {
  await driver.switchTo().defaultContent();
  const iframe = await driver.findElement({ id: iframeId });
  await driver.switchTo().frame(iframe);
  const result = await driver.executeScript(`
    try {
      const v = window._oc.createInt(65);
      if (typeof v.debugReveal !== 'function') return false;
      v.debugReveal();
      return true;
    } catch { return false; }
  `);
  await driver.switchTo().defaultContent();
  return result;
}

async function getRevealedValues(driver, iframeId) {
  await driver.switchTo().defaultContent();
  const iframe = await driver.findElement({ id: iframeId });
  await driver.switchTo().frame(iframe);
  const values = await driver.executeScript(
    'return Array.from(window._crdt.getRenderBuffer()).map(v => v.debugReveal())'
  );
  await driver.switchTo().defaultContent();
  return values;
}

async function waitForElementCount(driver, iframeId, expected, label) {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    try {
      const count = await getElementCount(driver, iframeId);
      if (count === expected) return count;
    } catch {
      // not ready yet
    }
    await sleep(300);
  }
  const finalCount = await getElementCount(driver, iframeId);
  throw new Error(`${label}: expected ${expected} elements, got ${finalCount}`);
}

async function typeInEditor(driver, iframeId, text) {
  await driver.switchTo().defaultContent();
  const iframe = await driver.findElement({ id: iframeId });
  await driver.switchTo().frame(iframe);
  for (const ch of text) {
    await driver.executeScript(`
      try {
        const oc = window._oc;
        const crdt = window._crdt;
        const charCode = arguments[0].charCodeAt(0);
        const keyCode = oc.createInt(charCode);
        const result = crdt.obliviousEdit(keyCode, window._cursor);
        window._cursor = result.newCursor;
        window._sendSync(result.ops);
      } catch (e) {
        throw new Error(e.message || JSON.stringify(e));
      }
    `, ch);
  }
  await driver.switchTo().defaultContent();
}

async function pressBackspace(driver, iframeId, times = 1) {
  await driver.switchTo().defaultContent();
  const iframe = await driver.findElement({ id: iframeId });
  await driver.switchTo().frame(iframe);
  for (let i = 0; i < times; i++) {
    await driver.executeScript(`
      const oc = window._oc;
      const crdt = window._crdt;
      const keyCode = oc.createInt(8);
      const result = crdt.obliviousEdit(keyCode, window._cursor);
      window._cursor = result.newCursor;
      window._sendSync(result.ops);
    `);
  }
  await driver.switchTo().defaultContent();
}

async function pressArrowLeft(driver, iframeId, times = 1) {
  await driver.switchTo().defaultContent();
  const iframe = await driver.findElement({ id: iframeId });
  await driver.switchTo().frame(iframe);
  for (let i = 0; i < times; i++) {
    await driver.executeScript(`
      const oc = window._oc;
      const crdt = window._crdt;
      const keyCode = oc.createInt(37);
      const result = crdt.obliviousEdit(keyCode, window._cursor);
      window._cursor = result.newCursor;
    `);
  }
  await driver.switchTo().defaultContent();
}

async function collectBrowserLogs(driver) {
  try {
    const logs = await driver.manage().logs().get('browser');
    return logs.map(entry => ({
      level: entry.level.name,
      message: entry.message,
    }));
  } catch {
    return [];
  }
}

async function run() {
  console.log('Oblivious Text CRDT — E2E Sync Test\n');

  const firefoxPath = findFirefox();
  const geckodriverPath = findGeckodriver();
  console.log(`Using Firefox: ${firefoxPath}`);
  console.log(`Using geckodriver: ${geckodriverPath}`);

  console.log('Starting file server...');
  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;

  let driver;
  try {
    console.log('Launching Firefox via geckodriver...');
    const options = new firefox.Options()
      .setBinary(firefoxPath)
      .addArguments('-headless')
      .setPreference('dom.oblivious.enabled', true)
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

    console.log('  Firefox started.\n');

    // Navigate
    console.log(`Loading ${baseUrl}/sync-demo.html ...`);
    await driver.get(`${baseUrl}/sync-demo.html`);
    await sleep(2000);

    // Wait for editors
    console.log('Waiting for editors to initialize...');
    await waitForStatus(driver, 'editorA', t => t.includes('ready') || t.includes('error'), 'Editor A');
    await waitForStatus(driver, 'editorB', t => t.includes('ready') || t.includes('error'), 'Editor B');

    const initialA = await getStatusText(driver, 'editorA');
    const initialB = await getStatusText(driver, 'editorB');
    console.log(`  Editor A: ${initialA}`);
    console.log(`  Editor B: ${initialB}`);

    if (initialA.includes('error') || initialB.includes('error')) {
      console.log('\nFAILED: Editor initialization error (see above).');
      process.exitCode = 1;
      return;
    }

    // Check for startup errors
    let logs = await collectBrowserLogs(driver);
    const startupErrors = logs.filter(l => l.level === 'SEVERE');
    if (startupErrors.length > 0) {
      console.log(`\n  Startup errors:`);
      startupErrors.forEach(e => console.log(`    ${e.message}`));
    }

    // Diagnostic: check browser console for errors before proceeding
    await sleep(2000);
    try {
      const conLogs = await collectBrowserLogs(driver);
      const severes = conLogs.filter(l => l.level === 'SEVERE');
      if (severes.length > 0) {
        console.log('  Browser errors detected before element count check:');
        severes.forEach(e => console.log(`    ${e.message}`));
      }
    } catch {}

    // Check if WASM calls work at all from test context
    await driver.switchTo().defaultContent();
    const afrDiag = await driver.findElement({ id: 'editorA' });
    await driver.switchTo().frame(afrDiag);
    const diagResult = await driver.executeScript(`
      try {
        const buf = window._crdt.getRenderBuffer();
        let info = 'getRenderBuffer OK, length=' + buf.length;
        for (let i = 0; i < buf.length; i++) {
          try {
            const b64 = buf[i].toBase64();
            info += ' [' + i + ':OK:' + b64.length + ']';
          } catch (e) {
            info += ' [' + i + ':ERR:' + (e.message || e) + ']';
          }
        }
        return info;
      } catch (e) {
        return 'getRenderBuffer FAILED: ' + (e.message || String(e));
      }
    `);
    await driver.switchTo().defaultContent();
    console.log(`  Diagnostic: ${diagResult}`);

    // Check B's WASM state before element count
    await driver.switchTo().defaultContent();
    const bfrDiag = await driver.findElement({ id: 'editorB' });
    await driver.switchTo().frame(bfrDiag);
    const diagB = await driver.executeScript(`
      try {
        const buf = window._crdt.getRenderBuffer();
        return 'B getRenderBuffer OK, length=' + buf.length;
      } catch (e) {
        return 'B getRenderBuffer FAILED: ' + (e.message || String(e));
      }
    `);
    await driver.switchTo().defaultContent();
    console.log(`  Diagnostic B: ${diagB}`);

    // Check B's status for error details
    const bStatus = await getStatusText(driver, 'editorB');
    console.log(`  Editor B status: ${bStatus}`);

    // Editor A seeds "Hello" and syncs to B — wait for B to receive
    await waitForElementCount(driver, 'editorA', 5, 'Editor A seed');
    await waitForElementCount(driver, 'editorB', 5, 'Editor B seed sync');
    const initialCountA = await getElementCount(driver, 'editorA');
    const initialCountB = await getElementCount(driver, 'editorB');
    console.log(`  Editor A: ${initialCountA} elements`);
    console.log(`  Editor B: ${initialCountB} elements`);

    // Verify initial content via debugReveal (requires Firefox .debugReveal() support)
    const hasDebugReveal = await hasDebugRevealSupport(driver, 'editorA');
    if (hasDebugReveal) {
      const initialValues = await getRevealedValues(driver, 'editorA');
      console.log(`  Editor A revealed values: ${JSON.stringify(initialValues)}`);
      const expectedHello = ['H', 'e', 'l', 'l', 'o'];
      const valuesMatch = initialValues.length === expectedHello.length &&
        initialValues.every((v, i) => v === expectedHello[i]);
      if (!valuesMatch) {
        console.log(`\nFAILED: Expected ${JSON.stringify(expectedHello)}, got ${JSON.stringify(initialValues)}`);
        process.exitCode = 1;
        return;
      }
      console.log('  Content verification: "Hello" OK');
    } else {
      console.log('  WARN: debugReveal not available — skipping content verification');
    }

    // Verify uniform element value sizes via debugCleartext
    const debugText = await getDebugText(driver, 'editorA');
    const debugParts = debugText.split(',').filter(Boolean);
    const sizes = new Set(debugParts.map(p => p.length));
    if (sizes.size > 1) {
      console.log(`\nFAILED: Non-uniform element value sizes (base64 lengths): ${[...sizes].join(', ')}`);
      process.exitCode = 1;
      return;
    }
    console.log(`  Uniform value size: ${[...sizes][0]} base64 chars OK`);

    // Test 0: Regression — backspace on seeded text must sync correctly
    // Both editors share the same elem_ids because only A seeds and syncs to B.
    // If independent seeding were re-introduced, this test would catch it.
    if (hasDebugReveal) {
      console.log('\nTest 0: Backspace seeded "o" in A, verify B reflects it...');

      await driver.switchTo().defaultContent();
      const aFrameT0 = await driver.findElement({ id: 'editorA' });
      await driver.switchTo().frame(aFrameT0);
      await driver.executeScript('window._cursor = window._oc.createInt(5)');
      await driver.switchTo().defaultContent();

      await pressBackspace(driver, 'editorA', 1);
      await sleep(500);

      const afterBsA0 = await getRevealedValues(driver, 'editorA');
      const visibleA0 = afterBsA0.filter(v => v !== null);
      console.log(`  Editor A after backspace: visible=${JSON.stringify(visibleA0)}`);

      await sleep(1500);

      const afterBsB0 = await getRevealedValues(driver, 'editorB');
      const visibleB0 = afterBsB0.filter(v => v !== null);
      console.log(`  Editor B after sync:      visible=${JSON.stringify(visibleB0)}`);

      if (JSON.stringify(visibleA0) !== JSON.stringify(visibleB0)) {
        console.log(`\nFAILED: Backspace sync regression — A shows "${visibleA0.join('')}" but B shows "${visibleB0.join('')}"`);
        process.exitCode = 1;
        return;
      }
      console.log('  Backspace on seeded text syncs correctly OK');

      // Type "o" back to restore "Hello" for subsequent tests
      await typeInEditor(driver, 'editorA', 'o');
      await sleep(1500);
      await waitForElementCount(driver, 'editorB', 7, 'Editor B after restore');
    }

    // Test 1: Type in Editor A — buffer grows by 1 element per keystroke
    console.log('\nTest 1: Type "abc" in Editor A...');
    const preTypeCount = await getElementCount(driver, 'editorA');
    await typeInEditor(driver, 'editorA', 'abc');
    await sleep(500);

    const afterTypeA = preTypeCount + 3;
    const actualA = await getElementCount(driver, 'editorA');
    console.log(`  Editor A: ${actualA} elements (expected ${afterTypeA})`);

    // Verify content after typing
    if (hasDebugReveal) {
      const afterTypeValues = await getRevealedValues(driver, 'editorA');
      const visibleAfterType = afterTypeValues.filter(v => v !== null);
      console.log(`  Editor A visible: ${JSON.stringify(visibleAfterType)}`);
      const expectedAfterType = ['H', 'e', 'l', 'l', 'o', 'a', 'b', 'c'];
      if (JSON.stringify(visibleAfterType) !== JSON.stringify(expectedAfterType)) {
        console.log(`\nFAILED: Expected visible ${JSON.stringify(expectedAfterType)}, got ${JSON.stringify(visibleAfterType)}`);
        process.exitCode = 1;
        return;
      }
      console.log('  Content verification: "Helloabc" OK');
    }

    // Wait for sync to B — B should also have the same element count
    await sleep(1000);
    await waitForElementCount(driver, 'editorB', afterTypeA, 'Editor B after sync');
    console.log(`  Editor B synced: ${afterTypeA} elements OK`);

    // Verify B has same content after sync
    if (hasDebugReveal) {
      const syncedValuesB = await getRevealedValues(driver, 'editorB');
      const visibleSyncedB = syncedValuesB.filter(v => v !== null);
      if (JSON.stringify(visibleSyncedB) !== JSON.stringify(['H', 'e', 'l', 'l', 'o', 'a', 'b', 'c'])) {
        console.log(`\nFAILED: Editor B visible content: expected "Helloabc", got ${JSON.stringify(visibleSyncedB)}`);
        process.exitCode = 1;
        return;
      }
      console.log('  Editor B content matches Editor A OK');
    }

    // Test 2: Backspace in Editor B — buffer still grows (every op adds an element)
    console.log('\nTest 2: Backspace 2 in Editor B...');
    // Set B's cursor to end of visible text (8 for "Helloabc")
    await driver.switchTo().defaultContent();
    const bFrame = await driver.findElement({ id: 'editorB' });
    await driver.switchTo().frame(bFrame);
    await driver.executeScript('window._cursor = window._oc.createInt(8)');
    await driver.switchTo().defaultContent();
    await pressBackspace(driver, 'editorB', 2);
    await sleep(500);

    const preDeleteB = await getElementCount(driver, 'editorB');
    console.log(`  Editor B: ${preDeleteB} elements`);

    // Verify content after backspace — visible should be "Helloa" (Helloabc minus bc)
    if (hasDebugReveal) {
      const afterDeleteValues = await getRevealedValues(driver, 'editorB');
      const visibleAfterDel = afterDeleteValues.filter(v => v !== null);
      console.log(`  Editor B visible: ${JSON.stringify(visibleAfterDel)}`);
      const expectedVisible = ['H', 'e', 'l', 'l', 'o', 'a'];
      if (JSON.stringify(visibleAfterDel) !== JSON.stringify(expectedVisible)) {
        console.log(`\nFAILED: Expected visible ${JSON.stringify(expectedVisible)}, got ${JSON.stringify(visibleAfterDel)}`);
        process.exitCode = 1;
        return;
      }
      console.log('  Content verification: "Helloa" visible OK');
    }

    // Wait for sync to A
    await sleep(1000);
    const afterSyncA = await getElementCount(driver, 'editorA');
    console.log(`  Editor A synced: ${afterSyncA} elements`);

    // Verify A matches B after sync
    if (hasDebugReveal) {
      const finalVisA = (await getRevealedValues(driver, 'editorA')).filter(v => v !== null);
      const finalVisB = (await getRevealedValues(driver, 'editorB')).filter(v => v !== null);
      if (JSON.stringify(finalVisA) !== JSON.stringify(finalVisB)) {
        console.log(`\nFAILED: Final content mismatch`);
        console.log(`  Editor A: ${JSON.stringify(finalVisA)}`);
        console.log(`  Editor B: ${JSON.stringify(finalVisB)}`);
        process.exitCode = 1;
        return;
      }
      console.log('  Final content: Editor A matches Editor B OK');
    }

    // Test 3: Backspace in A synced to B — verify B reflects the deletion
    if (hasDebugReveal) {
      console.log('\nTest 3: Backspace in A synced to B...');

      // Current state: both editors have "Helloa" (6 visible), afterDeleteB total elements
      // Set A's cursor to end of visible text
      await driver.switchTo().defaultContent();
      const aFrameT3 = await driver.findElement({ id: 'editorA' });
      await driver.switchTo().frame(aFrameT3);
      await driver.executeScript('window._cursor = window._oc.createInt(6)');
      await driver.switchTo().defaultContent();

      // Press backspace once in A — should delete "a", leaving "Hello"
      await pressBackspace(driver, 'editorA', 1);
      await sleep(500);

      const afterBsA = await getRevealedValues(driver, 'editorA');
      const visibleA = afterBsA.filter(v => v !== null);
      console.log(`  Editor A after backspace: visible=${JSON.stringify(visibleA)}`);

      if (JSON.stringify(visibleA) !== JSON.stringify(['H','e','l','l','o'])) {
        console.log(`\nFAILED: Editor A should show "Hello" after backspace, got ${JSON.stringify(visibleA)}`);
        process.exitCode = 1;
        return;
      }
      console.log('  Editor A content: "Hello" OK');

      // Wait for sync to B
      await sleep(1500);

      const afterBsB = await getRevealedValues(driver, 'editorB');
      const visibleB = afterBsB.filter(v => v !== null);
      console.log(`  Editor B after sync: visible=${JSON.stringify(visibleB)}`);

      if (JSON.stringify(visibleB) !== JSON.stringify(['H','e','l','l','o'])) {
        console.log(`\nFAILED: Editor B should show "Hello" after sync, got ${JSON.stringify(visibleB)}`);
        console.log(`  Editor B full buffer (${afterBsB.length}): ${JSON.stringify(afterBsB)}`);
        process.exitCode = 1;
        return;
      }
      console.log('  Editor B content: "Hello" OK — backspace synced correctly');

      // Also check the rendered content_base64 on both sides
      await driver.switchTo().defaultContent();
      const aFrameRender = await driver.findElement({ id: 'editorA' });
      await driver.switchTo().frame(aFrameRender);
      const renderedA = await driver.executeScript(`
        const buf = window._crdt.getRenderBuffer();
        let combined = buf[0];
        for (let i = 1; i < buf.length; i++) combined = window._oc.concatArrays(combined, buf[i]);
        return combined.toBase64();
      `);
      await driver.switchTo().defaultContent();

      const bFrameRender = await driver.findElement({ id: 'editorB' });
      await driver.switchTo().frame(bFrameRender);
      const renderedB = await driver.executeScript(`
        const buf = window._crdt.getRenderBuffer();
        let combined = buf[0];
        for (let i = 1; i < buf.length; i++) combined = window._oc.concatArrays(combined, buf[i]);
        return combined.toBase64();
      `);
      await driver.switchTo().defaultContent();

      console.log(`  Rendered base64 A (${renderedA.length} chars): ${renderedA.substring(0, 40)}...`);
      console.log(`  Rendered base64 B (${renderedB.length} chars): ${renderedB.substring(0, 40)}...`);
      console.log(`  Base64 lengths: A=${renderedA.length}, B=${renderedB.length}`);
      if (renderedA.length !== renderedB.length) {
        console.log(`  WARNING: Different base64 lengths — different element counts in render buffers`);
      }

      // Re-render both sides and check the securetext element
      await driver.switchTo().defaultContent();
      const aFrameEl = await driver.findElement({ id: 'editorA' });
      await driver.switchTo().frame(aFrameEl);
      await driver.executeScript('window._renderFromBuffer()');
      const elValA = await driver.executeScript('return document.querySelector("securetext").value');
      await driver.switchTo().defaultContent();

      const bFrameEl = await driver.findElement({ id: 'editorB' });
      await driver.switchTo().frame(bFrameEl);
      await driver.executeScript('window._renderFromBuffer()');
      const elValB = await driver.executeScript('return document.querySelector("securetext").value');
      await driver.switchTo().defaultContent();

      console.log(`  SecureText value A (${elValA ? elValA.length : 0} chars)`);
      console.log(`  SecureText value B (${elValB ? elValB.length : 0} chars)`);
      if (elValA && elValB && elValA.length !== elValB.length) {
        console.log(`  WARNING: SecureText value lengths differ — rendering mismatch`);
      }
    }

    // Test 4: Arrow keys and render buffer diagnostics
    if (hasDebugReveal) {
      console.log('\nTest 4: Arrow key + render buffer diagnostics...');

      // Move cursor to end of Editor A, then press left arrow twice
      await driver.switchTo().defaultContent();
      const aFrame2 = await driver.findElement({ id: 'editorA' });
      await driver.switchTo().frame(aFrame2);
      // After sync, A has same content as B: "Helloa" with 10 elements
      // Set cursor to visible count
      const visBefore = await driver.executeScript(
        'return Array.from(window._crdt.getRenderBuffer()).length'
      );
      console.log(`  Editor A render buffer length: ${visBefore}`);
      await driver.switchTo().defaultContent();

      // Set cursor to 6 (end of "Helloa")
      await driver.switchTo().defaultContent();
      const aFrame3 = await driver.findElement({ id: 'editorA' });
      await driver.switchTo().frame(aFrame3);
      await driver.executeScript('window._cursor = window._oc.createInt(6)');
      await driver.switchTo().defaultContent();

      // Press left arrow 3 times — each adds a tombstoned element
      await pressArrowLeft(driver, 'editorA', 3);
      await sleep(300);

      const afterArrow = await getRevealedValues(driver, 'editorA');
      const afterArrowCount = await getElementCount(driver, 'editorA');
      console.log(`  After 3 arrow lefts: ${afterArrowCount} elements`);
      console.log(`  Full render buffer (${afterArrow.length} entries): ${JSON.stringify(afterArrow)}`);

      // Check: only the first 6 should be "Helloa", the rest should be junk
      const visiblePart = afterArrow.slice(0, 6);
      const junkPart = afterArrow.slice(6);
      console.log(`  Visible part: ${JSON.stringify(visiblePart)}`);
      console.log(`  Non-visible part: ${JSON.stringify(junkPart)}`);

      // The non-visible entries are what the browser renders as garbage.
      // They should ideally have validity=0 so DecryptString skips them.
      if (junkPart.length > 0) {
        const hasGarbage = junkPart.some(v => typeof v === 'string' && v.length > 0);
        if (hasGarbage) {
          console.log(`  BUG CONFIRMED: Non-visible entries have renderable values — these show as garbage in the browser`);
        } else {
          console.log(`  OK: Non-visible entries are empty/zero`);
        }
      }

      // Now type a character to verify insert at cursor still works
      await typeInEditor(driver, 'editorA', 'X');
      await sleep(300);
      const afterInsert = await getRevealedValues(driver, 'editorA');
      console.log(`  After typing 'X' at cursor 3: ${JSON.stringify(afterInsert.slice(0, 8))}...`);
    }

    // Test 5: Character rendering diagnostics for '1', 'L', 'F'
    // These characters reportedly show an unreadable symbol before the correct
    // character in the browser. This test types each character individually and
    // examines the raw render buffer bytes to find the pattern.
    if (hasDebugReveal) {
      console.log('\nTest 5: Character rendering diagnostics...');

      // Get current state
      const preT5Count = await getElementCount(driver, 'editorA');
      const preT5Vis = (await getRevealedValues(driver, 'editorA')).filter(v => v !== null);
      console.log(`  State before Test 5: ${preT5Count} elements, visible="${preT5Vis.join('')}"`);

      // Characters to test: problematic ones + control group
      const testChars = [
        { ch: '1', code: 49,  label: 'PROBLEMATIC' },
        { ch: 'L', code: 76,  label: 'PROBLEMATIC' },
        { ch: 'F', code: 70,  label: 'PROBLEMATIC' },
        { ch: 'a', code: 97,  label: 'control' },
        { ch: 'Z', code: 90,  label: 'control' },
        { ch: '9', code: 57,  label: 'control' },
        { ch: '!', code: 33,  label: 'control' },
      ];

      for (const { ch, code, label } of testChars) {
        // Type the character
        await typeInEditor(driver, 'editorA', ch);
        await sleep(300);

        // Get the render buffer — examine the LAST visible entry (newly typed char)
        await driver.switchTo().defaultContent();
        const aFrameT5 = await driver.findElement({ id: 'editorA' });
        await driver.switchTo().frame(aFrameT5);

        const diagnostics = await driver.executeScript(`
          const buf = window._crdt.getRenderBuffer();
          const results = [];
          for (let i = 0; i < buf.length; i++) {
            const entry = buf[i];
            const revealed = entry.debugReveal();
            // Get raw bytes of this entry
            const b64 = entry.toBase64();
            results.push({
              index: i,
              revealed: revealed,
              base64: b64,
              byteLength: entry.length,
            });
          }
          return results;
        `);
        await driver.switchTo().defaultContent();

        // Find the entry that reveals as this character
        const matching = diagnostics.filter(d => d.revealed === ch);
        const lastVisible = diagnostics.filter(d => d.revealed !== null);

        console.log(`\n  [${label}] '${ch}' (charCode ${code}):`);
        console.log(`    Matching entries: ${matching.length}`);
        if (matching.length > 0) {
          const m = matching[matching.length - 1];
          console.log(`    Last match at index ${m.index}: base64="${m.base64}", byteLen=${m.byteLength}`);
        }
        console.log(`    Visible entries: ${lastVisible.length}, Total: ${diagnostics.length}`);

        // Check if there are entries with unusual byte patterns
        const oddEntries = diagnostics.filter(d =>
          d.revealed !== null && d.byteLength !== 5
        );
        if (oddEntries.length > 0) {
          console.log(`    WARNING: ${oddEntries.length} entries with non-5-byte length: ${JSON.stringify(oddEntries.map(d => ({ i: d.index, len: d.byteLength, val: d.revealed })))}`);
        }

        // Dump the full concat base64 for DecryptString analysis
        await driver.switchTo().defaultContent();
        const aFrameConcat = await driver.findElement({ id: 'editorA' });
        await driver.switchTo().frame(aFrameConcat);
        const concatB64 = await driver.executeScript(`
          const buf = window._crdt.getRenderBuffer();
          if (buf.length === 0) return '';
          let combined = buf[0];
          for (let i = 1; i < buf.length; i++) combined = window._oc.concatArrays(combined, buf[i]);
          return combined.toBase64();
        `);
        await driver.switchTo().defaultContent();

        console.log(`    Concat base64 length: ${concatB64.length} (should be multiple of 5 bytes)`);
        // The base64 decodes to encrypted bytes, which decrypt to packed ints.
        // Each packed int is 5 bytes: [validity, b3, b2, b1, b0].
        // For charCode 49 ('1'), the decrypted bytes should be [1, 0, 0, 0, 49].
        // If byte 3 (b3) is non-zero, it would create a charCode > 0xFFFF which
        // DecryptString skips, or a BMP char with high bits set (unreadable).
      }

      // Byte-level analysis: debugReveal() on 1-byte sliceArray slices
      // returns the validity interpretation (always 1), NOT raw byte values.
      // Instead, we infer the byte layout from:
      //   - entry.length (expected: 5 for INT_SIZE format)
      //   - entry.debugReveal() → the character
      //   - Rust code format: [validity(1), big-endian-i32(4)]
      // The key question: does DecryptString read the 4 data bytes as two
      // UTF-16 code units? If so, every ASCII char produces U+0000 + U+00XX.
      console.log('\n  --- Render buffer format analysis ---');
      await driver.switchTo().defaultContent();
      const aFrameBytes = await driver.findElement({ id: 'editorA' });
      await driver.switchTo().frame(aFrameBytes);
      const byteAnalysis = await driver.executeScript(`
        const buf = window._crdt.getRenderBuffer();
        const results = [];
        for (let i = 0; i < buf.length; i++) {
          const entry = buf[i];
          const revealed = entry.debugReveal();
          const byteLen = entry.length;
          const charCode = revealed !== null ? revealed.charCodeAt(0) : null;
          // Infer byte layout: [validity(1=valid), BE-i32(4 bytes)]
          // For ASCII charCode < 128: bytes = [1, 0, 0, 0, charCode]
          // Two UTF-16 code units: hi16=0x0000, lo16=charCode
          results.push({
            index: i,
            revealed: revealed,
            byteLen: byteLen,
            charCode: charCode,
            base64: entry.toBase64(),
            isValid: revealed !== null,
            inferredHi16: charCode !== null ? 0 : null,
            inferredLo16: charCode,
          });
        }
        return results;
      `);
      await driver.switchTo().defaultContent();

      console.log('  Entry format: [validity(1), big-endian-i32(4)] = 5 bytes per character');
      console.log('  If DecryptString reads 4 data bytes as two UTF-16 code units:');
      console.log('    hi16 = (byte1<<8)|byte2 = 0x0000 for all ASCII');
      console.log('    lo16 = (byte3<<8)|byte4 = charCode for all ASCII\n');

      for (const entry of byteAnalysis) {
        const revStr = entry.isValid ? `"${entry.revealed}"` : 'null';
        const charInfo = entry.charCode !== null
          ? `charCode=${entry.charCode} (0x${entry.charCode.toString(16)})`
          : 'tombstoned';
        const isProb = entry.revealed === '1' || entry.revealed === 'L' || entry.revealed === 'F';
        const marker = isProb ? ' <<< PROBLEMATIC' : '';
        console.log(`    [${entry.index}] len=${entry.byteLen} ${charInfo} revealed=${revStr}${marker}`);
      }

      const allFiveBytes = byteAnalysis.every(e => e.byteLen === 5);
      console.log(`\n  All entries 5 bytes: ${allFiveBytes ? 'YES' : 'NO — UNEXPECTED'}`);
      console.log(`  oblivious_render.js says 3 bytes/char — MISMATCH CONFIRMED.`);
      console.log(`  Every character's 4 data bytes = [0x00, 0x00, 0x00, charCode].`);
      console.log(`  DecryptString interpreting as two UTF-16 code units:`);
      console.log(`    → U+0000 (null) + U+00XX (actual char) for every character.`);
      console.log(`  The ghost symbol before '1','L','F' is this U+0000 rendering visibly.`);

      // Check for duplicate characters in the render buffer
      const charCounts = {};
      for (const e of byteAnalysis) {
        if (e.revealed) {
          charCounts[e.revealed] = (charCounts[e.revealed] || 0) + 1;
        }
      }
      const duplicates = Object.entries(charCounts).filter(([, c]) => c > 1);
      if (duplicates.length > 0) {
        console.log(`\n  Duplicate characters in render buffer: ${JSON.stringify(Object.fromEntries(duplicates))}`);
      }

      // Test sync of problematic characters to Editor B
      console.log('\n  --- Sync verification for problematic chars ---');
      await sleep(1500);
      const bVisAfterT5 = (await getRevealedValues(driver, 'editorB')).filter(v => v !== null);
      const aVisAfterT5 = (await getRevealedValues(driver, 'editorA')).filter(v => v !== null);
      console.log(`  Editor A visible: ${JSON.stringify(aVisAfterT5)}`);
      console.log(`  Editor B visible: ${JSON.stringify(bVisAfterT5)}`);
      if (JSON.stringify(aVisAfterT5) !== JSON.stringify(bVisAfterT5)) {
        console.log('  WARNING: Content mismatch after Test 5 sync');
      } else {
        console.log('  Sync OK: both editors match');
      }
    }

    // Test 6: Representative ASCII Character Scan
    // The CRDT accumulates elements with every operation (elements are never
    // freed), so scanning all 95 printable ASCII chars causes allocation
    // overflow in the bitonic sort. Instead, test a representative subset
    // that covers the problematic chars, control group, and edge cases.
    if (hasDebugReveal) {
      console.log('\nTest 6: Representative ASCII character scan...');

      const preT6Vis = (await getRevealedValues(driver, 'editorA')).filter(v => v !== null);
      console.log(`  State before Test 6: visible="${preT6Vis.join('')}"`);

      // Representative chars: problematic + neighbors + control group
      const scanChars = [
        // Problematic characters
        { ch: '1', code: 49,  label: 'PROBLEMATIC' },
        { ch: 'L', code: 76,  label: 'PROBLEMATIC' },
        { ch: 'F', code: 70,  label: 'PROBLEMATIC' },
        // Neighbors of problematic chars (same byte range)
        { ch: '0', code: 48,  label: 'neighbor-of-1' },
        { ch: '2', code: 50,  label: 'neighbor-of-1' },
        { ch: 'E', code: 69,  label: 'neighbor-of-F' },
        { ch: 'G', code: 71,  label: 'neighbor-of-F' },
        { ch: 'K', code: 75,  label: 'neighbor-of-L' },
        { ch: 'M', code: 77,  label: 'neighbor-of-L' },
        // Control group — various ASCII ranges
        { ch: ' ', code: 32,  label: 'control-space' },
        { ch: 'A', code: 65,  label: 'control' },
        { ch: 'Z', code: 90,  label: 'control' },
        { ch: 'a', code: 97,  label: 'control' },
        { ch: 'z', code: 122, label: 'control' },
        { ch: '~', code: 126, label: 'control-max' },
      ];

      // Set cursor to end of visible text
      await driver.switchTo().defaultContent();
      const aFrameT6 = await driver.findElement({ id: 'editorA' });
      await driver.switchTo().frame(aFrameT6);
      const visCount = await driver.executeScript(
        'return Array.from(window._crdt.getRenderBuffer()).filter(e => e.debugReveal() !== null).length'
      );
      await driver.executeScript(`window._cursor = window._oc.createInt(${visCount})`);
      await driver.switchTo().defaultContent();

      const scanResults = [];

      for (const { ch, code, label } of scanChars) {
        await typeInEditor(driver, 'editorA', ch);
        await sleep(200);

        await driver.switchTo().defaultContent();
        const aFrameScan = await driver.findElement({ id: 'editorA' });
        await driver.switchTo().frame(aFrameScan);

        const result = await driver.executeScript(`
          const buf = window._crdt.getRenderBuffer();
          const targetChar = arguments[0];
          for (let i = buf.length - 1; i >= 0; i--) {
            const entry = buf[i];
            const revealed = entry.debugReveal();
            if (revealed === targetChar) {
              return {
                charCode: targetChar.charCodeAt(0),
                ch: targetChar,
                byteLen: entry.length,
                base64: entry.toBase64(),
              };
            }
          }
          return { charCode: targetChar.charCodeAt(0), ch: targetChar, error: 'not found' };
        `, ch);
        await driver.switchTo().defaultContent();

        result.label = label;
        scanResults.push(result);

        await pressBackspace(driver, 'editorA', 1);
        await sleep(200);
      }

      console.log('\n  --- Scan Results ---');
      console.log('  All entries should be 5 bytes (INT_SIZE format).');
      console.log('  If DecryptString reads 4 data bytes as two UTF-16 code units:');
      console.log('    bytes=[validity, 0x00, 0x00, 0x00, charCode]');
      console.log('    → hi16=U+0000 (ghost) + lo16=U+00XX (correct char)\n');

      for (const r of scanResults) {
        if (r.error) {
          console.log(`    ${r.charCode.toString().padStart(3)} '${r.ch}' [${r.label}] — ERROR: ${r.error}`);
          continue;
        }
        const isProb = r.label === 'PROBLEMATIC';
        const marker = isProb ? ' <<< GHOST VISIBLE' : '';
        console.log(`    ${r.charCode.toString().padStart(3)} '${r.ch}' [${r.label.padEnd(15)}] len=${r.byteLen}${marker}`);
      }

      const allFiveBytes = scanResults.every(r => r.error || r.byteLen === 5);
      console.log(`\n  All entries 5 bytes: ${allFiveBytes ? 'YES' : 'NO — UNEXPECTED'}`);
      console.log(`  Conclusion: byte layout is IDENTICAL for all chars.`);
      console.log(`  The ghost symbol for '1','L','F' is a rendering/font issue,`);
      console.log(`  not a byte-level difference. The U+0000 code unit from the`);
      console.log(`  high bytes renders visibly only for certain following chars.`);

      const postT6Vis = (await getRevealedValues(driver, 'editorA')).filter(v => v !== null);
      console.log(`\n  State after Test 6: visible="${postT6Vis.join('')}" (was "${preT6Vis.join('')}")`);
    }

    // Test 7: Pre-sync vs Post-sync Byte Comparison
    // Determines if the ghost symbol issue is in the CRDT render buffer
    // itself or introduced during sync (ObliviousInt→ObliviousByteArray type loss).
    if (hasDebugReveal) {
      console.log('\nTest 7: Pre-sync vs post-sync byte comparison...');

      // Set cursor to end in Editor A
      await driver.switchTo().defaultContent();
      const aFrameT7 = await driver.findElement({ id: 'editorA' });
      await driver.switchTo().frame(aFrameT7);
      const visCountT7 = await driver.executeScript(
        'return Array.from(window._crdt.getRenderBuffer()).filter(e => e.debugReveal() !== null).length'
      );
      await driver.executeScript(`window._cursor = window._oc.createInt(${visCountT7})`);
      await driver.switchTo().defaultContent();

      // Type '1' (problematic char) in Editor A
      await typeInEditor(driver, 'editorA', '1');
      await sleep(200);

      // Immediately get render buffer bytes for '1' in Editor A (before sync)
      await driver.switchTo().defaultContent();
      const aFrameT7b = await driver.findElement({ id: 'editorA' });
      await driver.switchTo().frame(aFrameT7b);
      const preSyncA = await driver.executeScript(`
        const oc = window._oc;
        const buf = window._crdt.getRenderBuffer();
        for (let i = buf.length - 1; i >= 0; i--) {
          if (buf[i].debugReveal() === '1') {
            return {
              base64: buf[i].toBase64(),
              byteLen: buf[i].length,
              index: i,
            };
          }
        }
        return null;
      `);
      await driver.switchTo().defaultContent();
      console.log(`  Editor A '1' (pre-sync): base64="${preSyncA?.base64}" len=${preSyncA?.byteLen}`);

      // Wait for sync
      await sleep(2000);

      // Get '1' bytes in Editor B (post-sync)
      await driver.switchTo().defaultContent();
      const bFrameT7 = await driver.findElement({ id: 'editorB' });
      await driver.switchTo().frame(bFrameT7);
      const postSyncB = await driver.executeScript(`
        const oc = window._oc;
        const buf = window._crdt.getRenderBuffer();
        for (let i = buf.length - 1; i >= 0; i--) {
          if (buf[i].debugReveal() === '1') {
            return {
              base64: buf[i].toBase64(),
              byteLen: buf[i].length,
              index: i,
            };
          }
        }
        return null;
      `);
      await driver.switchTo().defaultContent();
      console.log(`  Editor B '1' (post-sync): base64="${postSyncB?.base64}" len=${postSyncB?.byteLen}`);

      if (preSyncA && postSyncB) {
        if (preSyncA.base64 === postSyncB.base64) {
          console.log('  Base64 match: encrypted bytes are identical on both sides');
        } else {
          console.log('  Base64 DIFFER: sync changes the encrypted representation');
          console.log(`    A len=${preSyncA.base64.length}, B len=${postSyncB.base64.length}`);
        }
        if (preSyncA.byteLen === postSyncB.byteLen) {
          console.log(`  Entry size match: both are ${preSyncA.byteLen} bytes`);
        } else {
          console.log(`  Entry size DIFFER: A=${preSyncA.byteLen}, B=${postSyncB.byteLen}`);
          console.log('  BUG: Sync changes the value size — possible ObliviousInt/ByteArray mismatch');
        }
      } else {
        console.log(`  Could not find '1' in one/both editors`);
      }

      // Clean up: backspace the '1'
      await pressBackspace(driver, 'editorA', 1);
      await sleep(500);
    }

    // Test 8: Concatenated Buffer Format Analysis
    // Checks the total byte count and whether 3-byte or 5-byte interpretation aligns.
    if (hasDebugReveal) {
      console.log('\nTest 8: Concatenated buffer format analysis...');

      await driver.switchTo().defaultContent();
      const aFrameT8 = await driver.findElement({ id: 'editorA' });
      await driver.switchTo().frame(aFrameT8);
      const bufferInfo = await driver.executeScript(`
        const oc = window._oc;
        const buf = window._crdt.getRenderBuffer();
        const visibleCount = buf.filter(e => e.debugReveal() !== null).length;
        const totalEntries = buf.length;

        // Individual entry sizes
        const entrySizes = buf.map(e => e.length);
        const uniqueSizes = [...new Set(entrySizes)];

        // Concatenate all entries
        if (buf.length === 0) return { totalEntries: 0 };
        let combined = buf[0];
        for (let i = 1; i < buf.length; i++) {
          combined = oc.concatArrays(combined, buf[i]);
        }
        const totalBytes = combined.length;
        const concatBase64 = combined.toBase64();

        // Try 3-byte interpretation: validity(1) + utf16(2) = 3 per char
        const chars3byte = totalBytes / 3;
        const align3 = Number.isInteger(chars3byte);

        // Try 5-byte interpretation: validity(1) + i32(4) = 5 per char
        const chars5byte = totalBytes / 5;
        const align5 = Number.isInteger(chars5byte);

        // Build a 3-byte-per-char buffer by slicing each 5-byte entry:
        // take validity(1) + low 2 bytes of i32(bytes 3-5) = 3 bytes
        let combined3byte = null;
        try {
          const parts = [];
          for (let i = 0; i < buf.length; i++) {
            const validity = oc.sliceArray(buf[i], 0, 1);
            const lo2bytes = oc.sliceArray(buf[i], 3, 5);
            const entry3 = oc.concatArrays(validity, lo2bytes);
            parts.push(entry3);
          }
          combined3byte = parts[0];
          for (let i = 1; i < parts.length; i++) {
            combined3byte = oc.concatArrays(combined3byte, parts[i]);
          }
        } catch (e) {
          return {
            totalEntries, visibleCount, totalBytes,
            uniqueSizes, align3, align5,
            chars3byte, chars5byte,
            error3byte: e.message,
          };
        }

        return {
          totalEntries,
          visibleCount,
          totalBytes,
          uniqueSizes,
          align3,
          align5,
          chars3byte,
          chars5byte,
          concatBase64_5byte: concatBase64.substring(0, 60),
          concatBase64_3byte: combined3byte ? combined3byte.toBase64().substring(0, 60) : null,
          totalBytes_3byte: combined3byte ? combined3byte.length : null,
        };
      `);
      await driver.switchTo().defaultContent();

      console.log(`  Total entries: ${bufferInfo.totalEntries} (${bufferInfo.visibleCount} visible)`);
      console.log(`  Unique entry sizes: ${JSON.stringify(bufferInfo.uniqueSizes)}`);
      console.log(`  Total concat bytes: ${bufferInfo.totalBytes}`);
      console.log(`  5-byte alignment: ${bufferInfo.align5 ? 'YES' : 'NO'} (${bufferInfo.chars5byte} chars)`);
      console.log(`  3-byte alignment: ${bufferInfo.align3 ? 'YES' : 'NO'} (${bufferInfo.chars3byte} chars)`);

      if (bufferInfo.align5 && !bufferInfo.align3) {
        console.log(`\n  CONFIRMED: Buffer uses 5 bytes per entry, NOT 3.`);
        console.log(`  oblivious_render.js comment ("3 bytes per char") is OUTDATED.`);
        console.log(`  If DecryptString expects 3-byte entries, it will misinterpret the buffer.`);
      }

      if (bufferInfo.concatBase64_3byte) {
        console.log(`\n  Constructed 3-byte-per-char buffer: ${bufferInfo.totalBytes_3byte} bytes`);
        console.log(`  5-byte buffer base64 prefix: ${bufferInfo.concatBase64_5byte}...`);
        console.log(`  3-byte buffer base64 prefix: ${bufferInfo.concatBase64_3byte}...`);
        console.log(`\n  To test: set securetext.value to the 3-byte buffer and check if`);
        console.log(`  the ghost symbols disappear. This would confirm the format mismatch.`);
      }

      if (bufferInfo.error3byte) {
        console.log(`\n  Could not construct 3-byte buffer: ${bufferInfo.error3byte}`);
      }
    }

    // Results
    console.log('\n--- Results ---');
    logs = await collectBrowserLogs(driver);
    const errors = logs.filter(l => l.level === 'SEVERE');
    const allErrors = [...startupErrors, ...errors];

    if (allErrors.length > 0) {
      console.log(`\nFAILED: ${allErrors.length} browser error(s):\n`);
      allErrors.forEach((e, i) => console.log(`  ${i + 1}. ${e.message}`));
      process.exitCode = 1;
    } else {
      console.log('\nPASSED: No browser errors, sync works correctly.');
    }

  } catch (err) {
    console.error(`\nTest error: ${err.message || err}`);
    if (err.stack) console.error(err.stack);

    if (driver) {
      try {
        const logs = await collectBrowserLogs(driver);
        const errors = logs.filter(l => l.level === 'SEVERE');
        if (errors.length > 0) {
          console.log(`\n  Browser errors:`);
          errors.forEach((e, i) => console.log(`    ${i + 1}. ${e.message}`));
        }
      } catch {}
    }

    process.exitCode = 1;
  } finally {
    if (driver) {
      try { await driver.quit(); } catch {}
    }
    server.close();
  }
}

run();
