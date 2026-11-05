// Keep startup small and every clip short: the Worker has a tight CPU budget per request,
// so small clips fail less and are cheap to retry while earlier ones play.
export function buildProgressiveChunks(words, fullText, startIndex = 0) {
  const targets = [100, 250, 400];
  const chunks = [];
  let i = Math.max(0, startIndex);
  while (i < words.length) {
    const target = targets[Math.min(chunks.length, targets.length - 1)];
    const start = words[i].charStart;
    let end = i;
    let sentenceEnd = -1;
    while (end + 1 < words.length) {
      const next = words[end + 1].charStart;
      const length = next - start;
      if (length > target) break;
      if (length >= target * 0.7 && /[.!?]["'”’)]*\s*$/.test(fullText.slice(start, next))) {
        sentenceEnd = end;
      }
      end++;
    }
    if (end + 1 < words.length && sentenceEnd >= i) end = sentenceEnd;
    const raw = fullText.slice(start, end + 1 < words.length ? words[end + 1].charStart : fullText.length);
    const trimmedStart = start + raw.length - raw.trimStart().length;
    chunks.push({
      text: raw.trim(), wordStart: i, wordEnd: end,
      charStarts: words.slice(i, end + 1).map(word => Math.max(0, word.charStart - trimmedStart)),
    });
    i = end + 1;
  }
  return chunks;
}

const LOOKAHEAD = 4;
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000];

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}

// A bounded window: current clip plus four ahead, with at most two fetches active.
// Errors flagged `retryable` (server overload, network) are retried with backoff in the
// background, so a flaky request is usually recovered before playback reaches it.
export class TtsBuffer {
  constructor(chunks, fetchClip, releaseClip, retryDelays = RETRY_DELAYS_MS) {
    this.chunks = chunks;
    this.fetchClip = fetchClip;
    this.releaseClip = releaseClip;
    this.retryDelays = retryDelays;
    this.entries = new Map();
    this.active = 0;
    this.closed = false;
  }

  async fetchWithRetry(chunk, signal) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.fetchClip(chunk, signal);
      } catch (error) {
        if (!error?.retryable || signal.aborted || attempt >= this.retryDelays.length) throw error;
        await sleep(this.retryDelays[attempt], signal);
      }
    }
  }

  fill(index) {
    if (this.closed) return;
    for (let i = index; i <= index + LOOKAHEAD && i < this.chunks.length; i++) {
      if (this.entries.has(i)) continue;
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      this.entries.set(i, { promise, resolve, controller: new AbortController(), started: false });
    }
    this.pump();
  }

  pump() {
    if (this.closed) return;
    for (const [index, entry] of this.entries) {
      if (this.active >= 2) break;
      if (entry.started) continue;
      entry.started = true;
      this.active++;
      Promise.resolve().then(() => {
        if (this.closed) return null;
        return this.fetchWithRetry(this.chunks[index], entry.controller.signal);
      }).then(clip => {
        if (this.closed) this.releaseClip(clip);
        else entry.clip = clip;
      }).catch(error => { entry.error = error; }).finally(() => {
        this.active--;
        entry.resolve();
        this.pump();
      });
    }
  }

  async take(index) {
    this.fill(index);
    const entry = this.entries.get(index);
    if (!entry) return null;
    await entry.promise;
    if (this.closed) return null;
    this.entries.delete(index);
    if (entry.error) throw entry.error;
    const clip = entry.clip;
    entry.clip = null;
    return clip;
  }

  close() {
    this.closed = true;
    for (const entry of this.entries.values()) {
      entry.controller.abort();
      this.releaseClip(entry.clip);
      entry.clip = null;
      entry.resolve();
    }
    this.entries.clear();
  }
}
