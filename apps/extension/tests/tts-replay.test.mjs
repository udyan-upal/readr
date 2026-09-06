import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/reader/reader.js', import.meta.url), 'utf8');
function setup() {
  const classes = new Set();
  const element = () => ({ style: {}, setAttribute(name, value) { this[name] = value; }, classList: {
    toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, remove(name) { classes.delete(name); },
  } });
  const state = { words: [{ el: {} }, { el: {} }], chunks: [], currentWordIndex: 1, isPlaying: true, rate: 1.5, selectedVoice: 'chris', sessionId: 7 };
  const started = [];
  const context = vm.createContext({
    readAloudState: state,
    btnRead: element(), readPlayer: element(), readPlayPause: element(), readStatus: element(),
    readVoiceLabel: element(), readRateCycle: element(), readError: element(), readProgressFill: element(),
    readHighlightPill: element(), readVoiceGroup: { querySelectorAll: () => [] },
    VOICE_LABEL: { chris: 'Chris' }, EDGE_TTS_VOICES: { chris: 'en-US-ChristopherNeural' },
    setVoicePopoverOpen() {}, clearReadAudio() { state.audio = null; }, clearPrefetchedReadClip() { state.buffer = null; },
    clearDoneReadWords() {}, updateDoneReadWords(index) { state.doneUntilIndex = index - 1; },
    setReadFollow(value) { state.followPlayback = value; }, followCurrentReadWord() {},
    buildReadAloudChunks(index) { started.push(index); return [{ wordStart: index }]; },
    TtsBuffer: class {}, releaseEdgeTtsClip() {}, setCurrentReadWord(index) { state.currentWordIndex = index; },
    formatTimeLeft: () => '0:01',
  });
  for (const [start, end] of [
    ['function readStatusText()', 'function setVoicePopoverOpen('],
    ['function updateReadAloudUI()', 'function setReadFollow('],
    ['async function speakReadChunk(', 'function startReadAloud('],
    ['function startReadAloud(', 'function pauseReadAloud('],
    ['function stopReadAloud(', 'btnRead.addEventListener'],
  ]) vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))), context);
  return { context, state, started, classes };
}

test('end of article retains an enabled replay control and full progress', async () => {
  const h = setup();
  await vm.runInContext('speakReadChunk(0)', h.context);
  assert.equal(h.state.isCompleted, true);
  assert.equal(h.state.isPlaying, false);
  assert.equal(h.state.audio, null);
  assert.equal(h.state.buffer, null);
  assert.equal(h.context.readPlayPause['aria-label'], 'Replay from beginning');
  assert.equal(h.context.readPlayPause.disabled, false);
  assert.equal(h.context.readProgressFill.style.width, '100%');
  assert.equal(h.context.readStatus.textContent, 'Finished');
  assert.ok(h.classes.has('open'));
  assert.ok(h.classes.has('completed'));
});

test('replay starts a fresh session from word zero and preserves voice and speed', () => {
  const h = setup();
  vm.runInContext('finishReadAloud(); speakReadChunk = () => {}; toggleReadAloud()', h.context);
  assert.deepEqual(h.started, [0]);
  assert.equal(h.state.currentWordIndex, 0);
  assert.equal(h.state.isCompleted, false);
  assert.equal(h.classes.has('completed'), false);
  assert.equal(h.state.selectedVoice, 'chris');
  assert.equal(h.state.rate, 1.5);
  assert.equal(h.state.followPlayback, true);
  assert.ok(h.state.sessionId > 7);
});

test('explicit stop dismisses the completed player', () => {
  const h = setup();
  vm.runInContext('finishReadAloud(); stopReadAloud()', h.context);
  assert.equal(h.state.isCompleted, false);
  assert.equal(h.classes.has('completed'), false);
  assert.equal(h.classes.has('open'), false);
  assert.equal(h.context.readProgressFill.style.width, '0%');
});
