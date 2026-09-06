import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/reader/reader.js', import.meta.url), 'utf8');
test('selection seeks by DOM order, including partial words and repeated text', () => {
  // Model ordered DOM boundary points; all words deliberately have identical text.
  const words = [5, 11, 17].map(end => ({ text: 'hello', el: { end } }));
  const context = vm.createContext({
    readAloudState: { words },
    articleBody: { contains: () => true },
    document: { createRange: () => ({
      selectNodeContents(el) { this.endOffset = el.end; this.endContainer = {}; },
      collapse() {},
    }) },
  });
  vm.runInContext(source.slice(source.indexOf('function readWordIndexAtRange('), source.indexOf('annotationToolbar.addEventListener("click"')), context);
  for (const [position, expected] of [[0, 0], [3, 0], [5, 1], [9, 1], [12, 2], [17, -1]]) {
    context.selection = { cloneRange: () => ({ collapse() {}, comparePoint: (_, end) => Math.sign(end - position) }) };
    assert.equal(vm.runInContext('readWordIndexAtRange(selection)', context), expected);
  }
});

test('Listen from here starts a fresh session at the selection without creating an annotation', async () => {
  let click;
  const calls = [];
  const context = vm.createContext({
    annotationToolbar: { addEventListener: (_, fn) => { click = fn; } },
    pendingRange: {},
    readWordIndexAtRange: () => 42,
    hideAnnotationUI: () => calls.push('hide'),
    window: { getSelection: () => ({ removeAllRanges: () => calls.push('clear') }) },
    setReadFollow: enabled => calls.push(['follow', enabled]),
    startReadAloud: index => calls.push(['start', index]),
    followCurrentReadWord: () => calls.push('scroll'),
    readAloudState: { words: Array.from({ length: 43 }, () => ({ el: {} })) },
  });
  const start = source.indexOf('annotationToolbar.addEventListener("click"');
  vm.runInContext(source.slice(start, source.indexOf('document.getElementById("comment-save")', start)), context);
  await click({ target: { closest: () => ({ dataset: { type: 'listen' } }) } });
  assert.deepEqual(calls, ['hide', 'clear', ['follow', true], ['start', 42], 'scroll']);
});
