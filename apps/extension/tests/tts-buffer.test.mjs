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
  [100, 250, 400, 400].forEach((target, i) => {
    assert.ok(chunks[i].text.length >= target * 0.7);
    assert.ok(chunks[i].text.length <= target + 20);
  });
  assert.deepEqual(buildProgressiveChunks([], ''), []);
});

test('two concurrent requests, ordered consumption, bounded lookahead', async () => {
  const pending = new Map();
  const started = [];
  const buffer = new TtsBuffer([0, 1, 2, 3, 4, 5, 6], (index) => {
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
  assert.deepEqual(started, [0, 1, 2, 3, 4]);
  pending.get(3)({ id: 3 });
  pending.get(4)({ id: 4 });
  await tick();
  // Window is current + 4 ahead: nothing past index 4 until playback advances.
  assert.deepEqual(started, [0, 1, 2, 3, 4]);
  assert.deepEqual(await buffer.take(1), { id: 1 });
  await tick();
  assert.deepEqual(started, [0, 1, 2, 3, 4, 5]);
  buffer.close();
  pending.get(5)({ id: 5 });
  await tick();
});

test('retryable failures are retried in the background until they succeed', async () => {
  const attempts = new Map();
  const buffer = new TtsBuffer([0, 1], async index => {
    const n = (attempts.get(index) ?? 0) + 1;
    attempts.set(index, n);
    if (n < 3) throw Object.assign(new Error('TTS failed (503)'), { retryable: true });
    return { id: index };
  }, () => {}, [0, 0, 0]);
  assert.deepEqual(await buffer.take(0), { id: 0 });
  assert.deepEqual(await buffer.take(1), { id: 1 });
  assert.equal(attempts.get(0), 3);
  assert.equal(attempts.get(1), 3);
  buffer.close();
});

test('retries give up after the last delay; non-retryable errors fail at once', async () => {
  let overloaded = 0, unauthorized = 0;
  const buffer = new TtsBuffer([0, 1], async index => {
    if (index === 0) { overloaded++; throw Object.assign(new Error('TTS failed (503)'), { retryable: true }); }
    unauthorized++;
    throw Object.assign(new Error('Unauthorized'), { retryable: false });
  }, () => {}, [0, 0]);
  await assert.rejects(buffer.take(0), /503/);
  await assert.rejects(buffer.take(1), /Unauthorized/);
  assert.equal(overloaded, 3);
  assert.equal(unauthorized, 1);
  buffer.close();
});

test('closing cancels a pending retry backoff', async () => {
  let calls = 0;
  const buffer = new TtsBuffer([0], async () => {
    calls++;
    throw Object.assign(new Error('TTS failed (503)'), { retryable: true });
  }, () => {}, [60_000]);
  const playback = buffer.take(0);
  await tick();
  buffer.close();
  assert.equal(await playback, null);
  assert.equal(calls, 1);
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
