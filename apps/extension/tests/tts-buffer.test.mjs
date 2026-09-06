import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProgressiveChunks, TtsBuffer } from '../src/reader/tts-buffer.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
function wordsFor(text) {
  return [...text.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)]
    .map(match => ({ text: match[0], charStart: match.index }));
}

test('progressive chunks preserve all words, offsets and punctuation, including seeks', () => {
  const text = 'A natural sentence with punctuation, contractions and words. '.repeat(100);
  const words = wordsFor(text);
  for (const start of [0, 17, words.length - 1]) {
    const chunks = buildProgressiveChunks(words, text, start);
    assert.equal(chunks[0].wordStart, start);
    assert.equal(chunks.at(-1).wordEnd, words.length - 1);
    assert.equal(chunks.map(c => c.text).join(' '), text.slice(words[start].charStart).trim());
    chunks.forEach((chunk, index) => {
      if (index) assert.equal(chunk.wordStart, chunks[index - 1].wordEnd + 1);
      chunk.charStarts.forEach((offset, i) => assert.ok(chunk.text.slice(offset).startsWith(words[chunk.wordStart + i].text)));
    });
  }
  const chunks = buildProgressiveChunks(words, text);
  [100, 500, 1000, 1500].forEach((target, i) => {
    assert.ok(chunks[i].text.length >= target * 0.7);
    assert.ok(chunks[i].text.length <= target + 20);
  });
  assert.deepEqual(buildProgressiveChunks([], ''), []);
});

test('two concurrent requests, ordered consumption, bounded lookahead', async () => {
  const pending = new Map();
  const started = [];
  const buffer = new TtsBuffer([0, 1, 2, 3, 4], (index) => {
    started.push(index);
    return new Promise(resolve => pending.set(index, resolve));
  }, () => {});
  const first = buffer.take(0);
  await tick();
  assert.deepEqual(started, [0, 1]);
  pending.get(1)({ id: 1 });
  await tick();
  assert.deepEqual(started, [0, 1, 2]);
  pending.get(2)({ id: 2 });
  pending.get(0)({ id: 0 });
  assert.deepEqual(await first, { id: 0 });
  await tick();
  assert.deepEqual(started, [0, 1, 2]);
  assert.deepEqual(await buffer.take(1), { id: 1 });
  await tick();
  assert.deepEqual(started, [0, 1, 2, 3]);
  buffer.close();
  pending.get(3)({ id: 3 });
  await tick();
});

test('closing aborts pending requests, releases late clips and unblocks playback', async () => {
  const signals = [], pending = [], released = [];
  const buffer = new TtsBuffer([0, 1, 2], (_, signal) => {
    signals.push(signal);
    return new Promise(resolve => pending.push(resolve));
  }, clip => { if (clip) released.push(clip.id); });
  const first = buffer.take(0);
  await tick();
  buffer.close();
  assert.equal(await first, null);
  assert.ok(signals.every(signal => signal.aborted));
  pending[0]({ id: 0 });
  pending[1]({ id: 1 });
  await tick();
  assert.deepEqual(released.sort(), [0, 1]);
  assert.equal(signals.length, 2);
});

test('prefetch failure is reported when consumed without unhandled rejection', async () => {
  const buffer = new TtsBuffer([0, 1], async index => {
    if (index === 1) throw new Error('provider failed');
    return { id: index };
  }, () => {});
  assert.deepEqual(await buffer.take(0), { id: 0 });
  await tick();
  await assert.rejects(buffer.take(1), /provider failed/);
  buffer.close();
});

test('closing releases buffered clips but leaves consumed audio to the player', async () => {
  const released = [];
  const buffer = new TtsBuffer([0, 1, 2], async id => ({ id }), clip => {
    if (clip) released.push(clip.id);
  });
  assert.deepEqual(await buffer.take(0), { id: 0 });
  await tick();
  buffer.close();
  buffer.close();
  assert.deepEqual(released.sort(), [1, 2]);
});

test('a new playback session starts immediately while cancelled requests settle', async () => {
  let finishOld;
  const released = [];
  const old = new TtsBuffer([0], () => new Promise(resolve => { finishOld = resolve; }), clip => {
    if (clip) released.push(clip.id);
  });
  const oldPlayback = old.take(0);
  await tick();
  old.close();
  const fresh = new TtsBuffer([0], async () => ({ id: 'new voice' }), () => {});
  assert.deepEqual(await fresh.take(0), { id: 'new voice' });
  finishOld({ id: 'old voice' });
  assert.equal(await oldPlayback, null);
  await tick();
  assert.deepEqual(released, ['old voice']);
  fresh.close();
});
