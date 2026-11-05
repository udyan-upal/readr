import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/reader/reader.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

function harness(audio) {
  let click;
  const state = { rate: 1.25, audio, sessionId: 4, buffer: {}, currentWordIndex: 23 };
  const context = vm.createContext({
    readAloudState: state,
    READ_RATES: [0.75, 1, 1.25, 1.5, 2],
    readRateCycle: { addEventListener: (_, callback) => { click = callback; } },
    updateReadAloudUI() {},
    chrome: { storage: { local: { async set() {} } } },
  });
  vm.runInContext(section('function applyReadPlaybackRate(', 'function base64ToAudioUrl'), context);
  vm.runInContext(section('readRateCycle.addEventListener', 'window.addEventListener'), context);
  return { state, context, click: () => click() };
}

test('speed changes retain the audio, position, pause state and buffered session', async () => {
  for (const paused of [false, true]) {
    const audio = { currentTime: 12.75, paused, playbackRate: 1.25 };
    const h = harness(audio);
    const buffer = h.state.buffer;
    await h.click();
    assert.equal(audio.playbackRate, 1.5);
    await h.click();
    assert.equal(audio.playbackRate, 2);
    assert.equal(audio.preservesPitch, true);
    assert.equal(audio.currentTime, 12.75);
    assert.equal(audio.paused, paused);
    assert.equal(h.state.audio, audio);
    assert.equal(h.state.buffer, buffer);
    assert.equal(h.state.sessionId, 4);
    assert.equal(h.state.currentWordIndex, 23);
  }
});

test('speed selected during loading is applied when the next clip starts', async () => {
  const h = harness(null);
  await h.click();
  await h.click();
  h.context.nextAudio = { playbackRate: 1 };
  vm.runInContext('applyReadPlaybackRate(nextAudio)', h.context);
  assert.equal(h.context.nextAudio.playbackRate, 2);
  assert.equal(h.context.nextAudio.preservesPitch, true);
});

test('TTS requests use normal speed regardless of selected playback speed', async () => {
  const h = harness(null);
  const requests = [];
  Object.assign(h.context, {
    EDGE_TTS_API_URL: 'http://localhost:3001/api/tts',
    EDGE_TTS_API_TOKEN: 'ext-token',
    fetch: async (_, options) => {
      assert.equal(options.headers.Authorization, 'Bearer ext-token');
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ audio: 'test', boundaries: [] }) };
    },
    base64ToAudioUrl: () => 'blob:test',
    Audio: class { load() {} },
    signal: new AbortController().signal,
  });
  vm.runInContext(section('async function fetchEdgeTtsClip(', 'function releaseEdgeTtsClip'), h.context);
  for (const rate of [0.75, 1.25, 1.5, 2]) {
    h.state.rate = rate;
    await vm.runInContext('fetchEdgeTtsClip({ text: "Hello world" }, signal, "en-US-EmmaNeural")', h.context);
  }
  assert.ok(requests.every(request => request.rate === '+0%'));
  assert.equal(requests.length, 4);
});
