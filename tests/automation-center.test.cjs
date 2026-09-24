'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Automation & Agent Control Center UI module and integration', async (t) => {
  await t.test('automation-center.mjs module exists and exports createAutomationCenterUI', () => {
    const filePath = path.join(__dirname, '../source/ui/automation-center.mjs');
    assert.ok(fs.existsSync(filePath), 'automation-center.mjs must exist');
    const content = fs.readFileSync(filePath, 'utf8');
    assert.match(content, /export function createAutomationCenterUI/);
    assert.match(content, /Active Now/);
    assert.match(content, /Needs Attention/);
    assert.match(content, /Upcoming Automations/);
    assert.match(content, /Automation Run History/);
    assert.match(content, /Workers &amp; Operational Resources/);
  });

  await t.test('app.mjs imports and routes automation-center', () => {
    const appPath = path.join(__dirname, '../source/ui/app.mjs');
    const content = fs.readFileSync(appPath, 'utf8');
    assert.match(content, /import \{ createAutomationCenterUI \} from "\.\/automation-center\.mjs";/);
    assert.match(content, /const automationUI = createAutomationCenterUI/);
    assert.match(content, /automation:\s*"⚡ Automation & Agent Center"/);
    assert.match(content, /if \(name === "automation"\)/);
  });

  await t.test('index.html contains Automation Center in sidebar', () => {
    const indexPath = path.join(__dirname, '../source/ui/index.html');
    const content = fs.readFileSync(indexPath, 'utf8');
    assert.match(content, /data-view="automation"/);
    assert.match(content, /id="automation-sidebar-btn"/);
  });

  await t.test('Administrator Today dashboard integrates automation summary card', () => {
    const todayPath = path.join(__dirname, '../source/ui/snf/today.mjs');
    const content = fs.readFileSync(todayPath, 'utf8');
    assert.match(content, /id="today-automation-summary-card"/);
    assert.match(content, /Automation Summary/);
    assert.match(content, /renderPage\('automation'\)/);
  });

  await t.test('style.css defines automation center operational styles and status strip', () => {
    const cssPath = path.join(__dirname, '../source/ui/style.css');
    const content = fs.readFileSync(cssPath, 'utf8');
    assert.match(content, /\.auto-center-page/);
    assert.match(content, /\.auto-status-strip/);
    assert.match(content, /\.auto-attention-section/);
    assert.match(content, /\.auto-job-grid/);
    assert.match(content, /\.auto-active-card/);
  });
});
