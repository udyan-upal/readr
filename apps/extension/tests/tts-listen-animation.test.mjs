import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/reader/reader.js', import.meta.url), 'utf8');

function setup() {
  const classes = new Set();
  const element = () => ({
    style: {},
    setAttribute(name, value) { this[name] = value; },
    classList: {
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      remove(name) { classes.delete(name); },
    },
  });
  const state = {
    words: [{ el: {} }, { el: {} }],
    currentWordIndex: 1,
    isPlaying: false,
    isPaused: false,
    isLoading: false,
    isCompleted: false,
    rate: 1,
    selectedVoice: 'chris',
    error: '',
  };
  const context = vm.createContext({
    readAloudState: state,
    btnRead: element(),
    readPlayer: element(),
    readPlayPause: element(),
    readStatus: element(),
    readVoiceLabel: element(),
    readRateCycle: element(),
    readError: element(),
    readProgressFill: element(),
    readVoiceGroup: { querySelectorAll: () => [] },
    VOICE_LABEL: { chris: 'Chris' },
    readStatusText: () => 'Playing',
    updateReadReturnButton() {},
  });
  const start = source.indexOf('function updateReadAloudUI()');
  vm.runInContext(source.slice(start, source.indexOf('function setReadFollow(', start)), context);
  return { context, state, classes };
}

function render(h) {
  vm.runInContext('updateReadAloudUI()', h.context);
}

test('listen button animates while audio is playing', () => {
  const h = setup();
  h.state.isPlaying = true;
  render(h);
  assert.ok(h.classes.has('reading'), 'playing adds the animation class');
  assert.ok(h.classes.has('active'));
});

test('pausing stops the animation but keeps the button highlighted', () => {
  const h = setup();
  h.state.isPlaying = true;
  render(h);
  h.state.isPlaying = false;
  h.state.isPaused = true;
  render(h);
  assert.equal(h.classes.has('reading'), false, 'paused must not animate');
  assert.ok(h.classes.has('active'), 'paused keeps the active highlight');
});

test('loading and completed states never animate', () => {
  const h = setup();
  h.state.isLoading = true;
  render(h);
  assert.equal(h.classes.has('reading'), false);

  h.state.isLoading = false;
  h.state.isCompleted = true;
  render(h);
  assert.equal(h.classes.has('reading'), false);
});

test('animation class clears when playback finishes', () => {
  const h = setup();
  h.state.isPlaying = true;
  render(h);
  assert.ok(h.classes.has('reading'));
  h.state.isPlaying = false;
  render(h);
  assert.equal(h.classes.has('reading'), false);
});
