import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/reader/reader.js', import.meta.url), 'utf8');
function setup() {
  const events = {};
  let click, scrolls = 0, cancellations = 0;
  const word = { getBoundingClientRect: () => ({ top: 1100, bottom: 1120 }), scrollIntoView: () => scrolls++ };
  const state = { followPlayback: true, isPlaying: true, words: [{ el: word }], currentWordIndex: 0 };
  const context = vm.createContext({
    readAloudState: state,
    readPlayPause: { focus() {} },
    readFollow: { hidden: true, setAttribute() {}, addEventListener: (_, fn) => { click = fn; } },
    window: { innerHeight: 900, scrollX: 0, scrollY: 500, scrollTo: () => cancellations++, addEventListener: (name, fn) => { events[name] = fn; } },
    word,
  });
  vm.runInContext(source.slice(source.indexOf('function setReadFollow('), source.indexOf('function setCurrentReadWord(')), context);
  return { events, state, word, context, click: () => click(), follow: () => vm.runInContext('followCurrentReadWord(word)', context), scrolls: () => scrolls, cancellations: () => cancellations };
}

test('manual scrolling disables following until explicitly re-enabled', () => {
  for (const event of ['wheel', 'touchmove']) {
    const h = setup();
    h.follow();
    assert.equal(h.scrolls(), 1);
    h.events[event]();
    assert.equal(h.context.readFollow.hidden, false);
    h.follow();
    assert.equal(h.scrolls(), 1);
    assert.equal(h.cancellations(), 1);
    assert.equal(h.state.isPlaying, true);
    h.click();
    assert.equal(h.context.readFollow.hidden, true);
    assert.equal(h.state.followPlayback, true);
    assert.equal(h.scrolls(), 2);
  }
});

test('visible words do not recenter the viewport', () => {
  const h = setup();
  h.word.getBoundingClientRect = () => ({ top: 300, bottom: 330 });
  h.follow();
  assert.equal(h.scrolls(), 0);
});

test('keyboard and scrollbar navigation disengage following, player controls do not', () => {
  const h = setup();
  h.events.pointerdown({ target: { closest: () => ({}) } });
  assert.equal(h.state.followPlayback, true);
  h.events.keydown({ key: 'PageDown', target: { closest: () => null } });
  assert.equal(h.state.followPlayback, false);
  h.click();
  h.events.pointerdown({ target: { closest: () => null } });
  assert.equal(h.state.followPlayback, false);
});

test('scrolling before playback does not disable the initial follow behavior', () => {
  const h = setup();
  h.state.isPlaying = false;
  h.events.wheel();
  assert.equal(h.state.followPlayback, true);
});

test('return action disappears after playback ends', () => {
  const h = setup();
  h.events.wheel();
  assert.equal(h.context.readFollow.hidden, false);
  h.state.isPlaying = false;
  vm.runInContext('updateReadReturnButton()', h.context);
  assert.equal(h.context.readFollow.hidden, true);
});
