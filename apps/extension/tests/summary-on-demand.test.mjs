import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../src/reader/reader.js', import.meta.url), 'utf8');
const element = () => ({ textContent: '', classList: { add() {}, toggle() {} } });

test('opening TLDR restores its UI without generating a summary', async () => {
  let refreshed = 0;
  const context = vm.createContext({
    assistPanel: element(), body: element(), btnAssist: element(), ASSIST_TABS: [],
    refreshReadHighlight() {}, getArticleKey: () => 'article', articleAiRestore: Promise.resolve(),
    isAssistOpen: () => true, updateSummaryUI: () => refreshed++,
    streamSummary() { throw new Error('Opening a panel must not generate'); },
  });
  vm.runInContext(source.slice(source.indexOf('async function openAssist('), source.indexOf('function closeAssist(')), context);
  await vm.runInContext('openAssist("tldr")', context);
  assert.equal(refreshed, 1);
});

test('summary UI offers explicit generation, loading, saved content and retry states', () => {
  const context = vm.createContext({
    summaryText: element(), summaryEmpty: element(), summaryGenerate: element(), summaryRegen: element(), summaryStatus: element(),
    summaryGenerating: false, summaryError: '',
  });
  const start = source.indexOf('function updateSummaryUI()');
  vm.runInContext(source.slice(start, source.indexOf('summaryGenerate.addEventListener', start)), context);
  const render = () => vm.runInContext('updateSummaryUI()', context);
  render();
  assert.equal(context.summaryEmpty.hidden, false);
  assert.equal(context.summaryGenerate.textContent, 'Generate summary');
  context.summaryGenerating = true;
  render();
  assert.equal(context.summaryEmpty.hidden, true);
  assert.equal(context.summaryGenerate.disabled, true);
  assert.equal(context.summaryStatus.textContent, 'Creating your summary…');
  context.summaryGenerating = false;
  context.summaryText.textContent = 'Saved summary';
  render();
  assert.equal(context.summaryEmpty.hidden, true);
  assert.equal(context.summaryStatus.hidden, true);
  context.summaryText.textContent = '';
  context.summaryError = 'Please try again';
  render();
  assert.equal(context.summaryEmpty.hidden, false);
  assert.equal(context.summaryGenerate.textContent, 'Try again');
});
