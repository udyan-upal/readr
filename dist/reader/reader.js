// src/reader/reader.js
var NVIDIA_API_KEY = "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";
var currentArticle = null;
var currentSettings = { theme: "light", font: "inter", size: "medium" };
var summaryGenerating = false;
var readAloudState = {
  words: [],
  chunks: [],
  currentChunkIndex: 0,
  currentWordIndex: -1,
  boundaries: [],
  audio: null,
  audioUrl: null,
  selectedVoice: "emma",
  rate: 1,
  isLoading: false,
  isPlaying: false,
  isPaused: false,
  sessionId: 0,
  error: null
};
var progressBar = document.getElementById("progress-bar");
var body = document.body;
var loadingState = document.getElementById("loading-state");
var articleContainer = document.getElementById("article-container");
var errorState = document.getElementById("error-state");
var errorMessage = document.getElementById("error-message");
var siteNameEl = document.getElementById("site-name");
var originalUrlEl = document.getElementById("original-url");
var readTimeEl = document.getElementById("read-time");
var bylineEl = document.getElementById("byline");
var titleEl = document.getElementById("article-title");
var articleBody = document.getElementById("article-body");
var btnRead = document.getElementById("btn-read");
var btnHighlights = document.getElementById("btn-highlights");
var btnSettings = document.getElementById("btn-settings");
var btnTldr = document.getElementById("btn-tldr");
var settingsPanel = document.getElementById("settings-panel");
var highlightsPanel = document.getElementById("highlights-panel");
var summaryPanel = document.getElementById("summary-panel");
var closeSettings = document.getElementById("close-settings");
var closeHighlights = document.getElementById("close-highlights");
var highlightsList = document.getElementById("highlights-list");
var annotationToolbar = document.getElementById("annotation-toolbar");
var commentPopup = document.getElementById("comment-popup");
var commentInput = document.getElementById("comment-input");
var annotationTooltip = document.getElementById("annotation-tooltip");
var readPlayer = document.getElementById("read-player");
var readProgressFill = document.getElementById("read-progress-fill");
var readPlayPause = document.getElementById("read-play-pause");
var readStop = document.getElementById("read-stop");
var readVoiceGroup = document.getElementById("read-voice-group");
var readRateGroup = document.getElementById("read-rate-group");
var readError = document.getElementById("read-error");
async function init() {
  const saved = await chrome.storage.local.get(["theme", "font", "size", "readVoice", "readRate"]);
  currentSettings.theme = saved.theme || "light";
  currentSettings.font = saved.font || "inter";
  currentSettings.size = saved.size || "medium";
  readAloudState.selectedVoice = saved.readVoice || "emma";
  readAloudState.rate = saved.readRate || 1;
  applySettings();
  updateSettingsUI();
  updateReadAloudUI();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "session")
      return;
    if (!("pendingArticle" in changes) && !("pendingError" in changes))
      return;
    const article = changes.pendingArticle?.newValue ?? null;
    const error = changes.pendingError?.newValue ?? null;
    loadingState.style.display = "none";
    articleContainer.style.display = "none";
    errorState.style.display = "none";
    if (article) {
      currentArticle = article;
      renderArticle(article);
    } else if (error) {
      showError(error);
    }
  });
  const session = await chrome.storage.session.get(["pendingArticle", "pendingError"]);
  if (session.pendingArticle) {
    loadingState.style.display = "none";
    currentArticle = session.pendingArticle;
    renderArticle(session.pendingArticle);
  } else if (session.pendingError) {
    loadingState.style.display = "none";
    showError(session.pendingError);
  }
}
function renderArticle(article) {
  stopReadAloud({ keepPlayerOpen: false });
  document.title = article.title ? `${article.title} — readr` : "readr";
  siteNameEl.textContent = article.siteName || "";
  originalUrlEl.textContent = article.url || "";
  originalUrlEl.href = article.url || "#";
  if (article.readTime)
    readTimeEl.textContent = `${article.readTime} min read`;
  if (article.byline) {
    bylineEl.textContent = article.byline;
    bylineEl.style.display = "";
  } else {
    bylineEl.style.display = "none";
  }
  titleEl.textContent = article.title || "";
  articleBody.innerHTML = article.content || "";
  articleBody.querySelectorAll("a").forEach((a) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  });
  prepareReadAloudWords();
  articleContainer.style.display = "";
  applyAnnotationsToDOM();
}
function showError(msg) {
  errorMessage.textContent = msg;
  errorState.style.display = "";
}
function applySettings() {
  body.setAttribute("data-theme", currentSettings.theme);
  articleBody.className = "";
  articleBody.classList.add(`font-${currentSettings.font}`, `font-${currentSettings.size}`);
}
function updateSettingsUI() {
  document.querySelectorAll("#theme-group .option-btn").forEach((btn) => btn.classList.toggle("selected", btn.dataset.value === currentSettings.theme));
  document.querySelectorAll("#font-group .option-btn").forEach((btn) => btn.classList.toggle("selected", btn.dataset.value === currentSettings.font));
  document.querySelectorAll("#size-group .option-btn").forEach((btn) => btn.classList.toggle("selected", btn.dataset.value === currentSettings.size));
}
async function saveSetting(key, value) {
  currentSettings[key] = value;
  await chrome.storage.local.set({ [key]: value });
  applySettings();
  updateSettingsUI();
}
document.getElementById("theme-group").addEventListener("click", (e) => {
  const btn = e.target.closest(".option-btn");
  if (btn)
    saveSetting("theme", btn.dataset.value);
});
document.getElementById("font-group").addEventListener("click", (e) => {
  const btn = e.target.closest(".option-btn");
  if (btn)
    saveSetting("font", btn.dataset.value);
});
document.getElementById("size-group").addEventListener("click", (e) => {
  const btn = e.target.closest(".option-btn");
  if (btn)
    saveSetting("size", btn.dataset.value);
});
var ALL_PANELS = [
  { panel: settingsPanel, btn: btnSettings },
  { panel: highlightsPanel, btn: btnHighlights },
  { panel: summaryPanel, btn: btnTldr }
];
function openPanel(panel, btnEl) {
  ALL_PANELS.forEach(({ panel: p, btn: b }) => {
    p.classList.remove("open");
    b.classList.remove("active");
  });
  panel.classList.add("open");
  btnEl.classList.add("active");
}
function closeAllPanels() {
  ALL_PANELS.forEach(({ panel: p, btn: b }) => {
    p.classList.remove("open");
    b.classList.remove("active");
  });
}
btnSettings.addEventListener("click", () => {
  settingsPanel.classList.contains("open") ? closeAllPanels() : openPanel(settingsPanel, btnSettings);
});
btnHighlights.addEventListener("click", () => {
  if (highlightsPanel.classList.contains("open")) {
    closeAllPanels();
  } else {
    renderAnnotationsPanel();
    openPanel(highlightsPanel, btnHighlights);
  }
});
btnTldr.addEventListener("click", () => {
  if (summaryPanel.classList.contains("open")) {
    closeAllPanels();
  } else {
    openPanel(summaryPanel, btnTldr);
    if (!summaryText.textContent)
      streamSummary();
  }
});
closeSettings.addEventListener("click", closeAllPanels);
closeHighlights.addEventListener("click", closeAllPanels);
window.addEventListener("scroll", () => {
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const pct = docHeight > 0 ? window.scrollY / docHeight * 100 : 0;
  progressBar.style.width = `${Math.min(100, pct)}%`;
});
var EDGE_TTS_API_URL = "http://localhost:3001/api/tts";
var EDGE_TTS_VOICES = {
  ava: "en-US-AvaNeural",
  chris: "en-US-ChristopherNeural",
  emma: "en-US-EmmaNeural"
};
function rateToEdgeRate(rate) {
  const pct = Math.round((rate - 1) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}
function base64ToAudioUrl(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0;i < bin.length; i++)
    bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
}
async function fetchEdgeTtsClip(chunk) {
  const response = await fetch(EDGE_TTS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: chunk.text,
      voice: EDGE_TTS_VOICES[readAloudState.selectedVoice],
      rate: rateToEdgeRate(readAloudState.rate)
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || `TTS failed (${response.status})`);
  if (!data.audio)
    throw new Error("TTS returned no audio.");
  return {
    url: base64ToAudioUrl(data.audio),
    boundaries: Array.isArray(data.boundaries) ? data.boundaries : []
  };
}
function prepareReadAloudWords() {
  readAloudState.words = [];
  readAloudState.chunks = [];
  readAloudState.currentChunkIndex = 0;
  readAloudState.currentWordIndex = -1;
  const walker = document.createTreeWalker(articleBody, NodeFilter.SHOW_TEXT, {
    acceptNode(node2) {
      if (!node2.textContent.trim())
        return NodeFilter.FILTER_REJECT;
      if (node2.parentElement?.closest("script, style, textarea, button"))
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  let node;
  while (node = walker.nextNode())
    nodes.push(node);
  const wordPattern = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
  for (const textNode of nodes) {
    const text = textNode.textContent;
    wordPattern.lastIndex = 0;
    if (!wordPattern.test(text))
      continue;
    wordPattern.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    while (match = wordPattern.exec(text)) {
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const span = document.createElement("span");
      span.className = "read-word";
      span.dataset.readIndex = String(readAloudState.words.length);
      span.textContent = match[0];
      frag.appendChild(span);
      readAloudState.words.push({ text: match[0], el: span });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length)
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    textNode.replaceWith(frag);
  }
  updateReadAloudUI();
}
function buildReadAloudChunks(startIndex) {
  const chunks = [];
  const maxChars = 1500;
  let chunk = null;
  for (let i = Math.max(0, startIndex);i < readAloudState.words.length; i++) {
    const word = readAloudState.words[i].text;
    if (!chunk)
      chunk = { text: "", wordStart: i, wordEnd: i, charStarts: [] };
    const prefix = chunk.text ? " " : "";
    if (chunk.text && chunk.text.length + prefix.length + word.length > maxChars) {
      chunks.push(chunk);
      chunk = { text: "", wordStart: i, wordEnd: i, charStarts: [] };
    }
    chunk.charStarts.push(chunk.text.length + (chunk.text ? 1 : 0));
    chunk.text += `${chunk.text ? " " : ""}${word}`;
    chunk.wordEnd = i;
  }
  if (chunk?.text)
    chunks.push(chunk);
  return chunks;
}
function updateReadAloudUI() {
  btnRead.classList.toggle("active", readAloudState.isPlaying || readAloudState.isPaused);
  readPlayer.classList.toggle("open", readAloudState.isLoading || readAloudState.isPlaying || readAloudState.isPaused || !!readAloudState.error);
  readPlayPause.textContent = readAloudState.isLoading ? "Loading" : readAloudState.isPlaying ? "Pause" : "Play";
  readPlayPause.title = readAloudState.isPlaying ? "Pause" : "Play";
  readPlayPause.disabled = readAloudState.isLoading;
  readError.textContent = readAloudState.error || "";
  readError.classList.toggle("visible", !!readAloudState.error);
  readVoiceGroup.querySelectorAll(".read-chip[data-voice]").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.voice === readAloudState.selectedVoice);
  });
  readRateGroup.querySelectorAll(".read-chip[data-rate]").forEach((btn) => {
    btn.classList.toggle("selected", Number(btn.dataset.rate) === readAloudState.rate);
  });
  const total = Math.max(1, readAloudState.words.length - 1);
  const pct = readAloudState.currentWordIndex > 0 ? readAloudState.currentWordIndex / total * 100 : 0;
  readProgressFill.style.width = `${Math.min(100, pct)}%`;
}
function setCurrentReadWord(index, scroll = true) {
  const previous = readAloudState.words[readAloudState.currentWordIndex]?.el;
  previous?.classList.remove("read-word-current");
  readAloudState.currentWordIndex = index;
  const current = readAloudState.words[index]?.el;
  if (current) {
    current.classList.add("read-word-current");
    if (scroll)
      current.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  updateReadAloudUI();
}
function wordIndexFromTime(chunk, ms) {
  const boundaries = readAloudState.boundaries;
  let boundaryIndex = -1;
  for (let i = 0;i < boundaries.length; i++) {
    if ((boundaries[i].offsetMs || 0) <= ms)
      boundaryIndex = i;
    else
      break;
  }
  if (boundaryIndex >= 0)
    return Math.min(chunk.wordEnd, chunk.wordStart + boundaryIndex);
  return chunk.wordStart;
}
function clearReadAudio() {
  const audio = readAloudState.audio;
  if (audio) {
    audio.pause();
    audio.ontimeupdate = null;
    audio.onended = null;
    audio.onerror = null;
    audio.onpause = null;
    audio.onplay = null;
    audio.src = "";
  }
  if (readAloudState.audioUrl)
    URL.revokeObjectURL(readAloudState.audioUrl);
  readAloudState.audio = null;
  readAloudState.audioUrl = null;
  readAloudState.boundaries = [];
}
async function speakReadChunk(chunkIndex) {
  const chunk = readAloudState.chunks[chunkIndex];
  if (!chunk) {
    stopReadAloud({ keepPlayerOpen: false });
    return;
  }
  readAloudState.currentChunkIndex = chunkIndex;
  const sessionId = readAloudState.sessionId;
  readAloudState.isLoading = true;
  readAloudState.error = null;
  updateReadAloudUI();
  try {
    clearReadAudio();
    const clip = await fetchEdgeTtsClip(chunk);
    if (sessionId !== readAloudState.sessionId) {
      URL.revokeObjectURL(clip.url);
      return;
    }
    const audio = new Audio(clip.url);
    readAloudState.audio = audio;
    readAloudState.audioUrl = clip.url;
    readAloudState.boundaries = clip.boundaries;
    audio.ontimeupdate = () => {
      if (sessionId !== readAloudState.sessionId)
        return;
      setCurrentReadWord(wordIndexFromTime(chunk, audio.currentTime * 1000));
    };
    audio.onended = () => {
      if (sessionId !== readAloudState.sessionId)
        return;
      speakReadChunk(chunkIndex + 1);
    };
    audio.onerror = () => {
      if (sessionId !== readAloudState.sessionId)
        return;
      readAloudState.isLoading = false;
      readAloudState.isPlaying = false;
      readAloudState.isPaused = false;
      readAloudState.error = "Could not play Edge TTS audio.";
      updateReadAloudUI();
    };
    readAloudState.isLoading = false;
    readAloudState.isPlaying = true;
    readAloudState.isPaused = false;
    updateReadAloudUI();
    await audio.play();
  } catch (err) {
    if (sessionId !== readAloudState.sessionId)
      return;
    clearReadAudio();
    readAloudState.isLoading = false;
    readAloudState.isPlaying = false;
    readAloudState.isPaused = false;
    readAloudState.error = `${err.message || "Edge TTS failed."} Make sure ebook-reader is running on localhost:3001.`;
    updateReadAloudUI();
  }
}
function startReadAloud(startIndex = 0) {
  if (!readAloudState.words.length)
    prepareReadAloudWords();
  if (!readAloudState.words.length)
    return;
  readAloudState.sessionId += 1;
  clearReadAudio();
  const safeStart = Math.max(0, Math.min(startIndex, readAloudState.words.length - 1));
  readAloudState.chunks = buildReadAloudChunks(safeStart);
  readAloudState.currentChunkIndex = 0;
  readAloudState.isLoading = false;
  readAloudState.isPlaying = false;
  readAloudState.isPaused = false;
  readAloudState.error = null;
  setCurrentReadWord(safeStart, false);
  updateReadAloudUI();
  speakReadChunk(0);
}
function pauseReadAloud() {
  readAloudState.audio?.pause();
  readAloudState.isPlaying = false;
  readAloudState.isPaused = true;
  updateReadAloudUI();
}
async function resumeReadAloud() {
  if (!readAloudState.audio) {
    startReadAloud(Math.max(0, readAloudState.currentWordIndex));
    return;
  }
  await readAloudState.audio.play();
  readAloudState.isPlaying = true;
  readAloudState.isPaused = false;
  updateReadAloudUI();
}
function stopReadAloud({ keepPlayerOpen = false } = {}) {
  readAloudState.sessionId += 1;
  clearReadAudio();
  readAloudState.words[readAloudState.currentWordIndex]?.el?.classList.remove("read-word-current");
  readAloudState.isLoading = false;
  readAloudState.isPlaying = false;
  readAloudState.isPaused = false;
  readAloudState.currentWordIndex = -1;
  readAloudState.error = null;
  readProgressFill.style.width = "0%";
  if (!keepPlayerOpen)
    readPlayer.classList.remove("open");
  updateReadAloudUI();
}
function toggleReadAloud() {
  if (readAloudState.isPlaying) {
    pauseReadAloud();
  } else if (readAloudState.isPaused) {
    resumeReadAloud();
  } else {
    startReadAloud(Math.max(0, readAloudState.currentWordIndex));
  }
}
btnRead.addEventListener("click", toggleReadAloud);
readPlayPause.addEventListener("click", toggleReadAloud);
readStop.addEventListener("click", () => stopReadAloud({ keepPlayerOpen: false }));
readVoiceGroup.addEventListener("click", async (e) => {
  const btn = e.target.closest(".read-chip[data-voice]");
  if (!btn)
    return;
  readAloudState.selectedVoice = btn.dataset.voice;
  await chrome.storage.local.set({ readVoice: readAloudState.selectedVoice });
  const restartAt = Math.max(0, readAloudState.currentWordIndex);
  const wasActive = readAloudState.isPlaying || readAloudState.isPaused;
  updateReadAloudUI();
  if (wasActive)
    startReadAloud(restartAt);
});
readRateGroup.addEventListener("click", async (e) => {
  const btn = e.target.closest(".read-chip[data-rate]");
  if (!btn)
    return;
  readAloudState.rate = Number(btn.dataset.rate) || 1;
  await chrome.storage.local.set({ readRate: readAloudState.rate });
  const restartAt = Math.max(0, readAloudState.currentWordIndex);
  const wasActive = readAloudState.isPlaying || readAloudState.isPaused;
  updateReadAloudUI();
  if (wasActive)
    startReadAloud(restartAt);
});
window.addEventListener("beforeunload", () => stopReadAloud({ keepPlayerOpen: false }));
function findTextInDOM(container, searchText, prefix, suffix) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let nd;
  while (nd = walker.nextNode())
    nodes.push(nd);
  let offset = 0;
  const nodeOffsets = nodes.map((n) => {
    const start = offset;
    offset += n.textContent.length;
    return { node: n, start, end: offset };
  });
  const full = nodes.map((n) => n.textContent).join("");
  let matchStart = -1;
  let searchFrom = 0;
  while (true) {
    const idx = full.indexOf(searchText, searchFrom);
    if (idx === -1)
      break;
    const pre = full.slice(Math.max(0, idx - 30), idx);
    const suf = full.slice(idx + searchText.length, idx + searchText.length + 30);
    const preOk = !prefix || pre.includes(prefix.slice(-12));
    const sufOk = !suffix || suf.includes(suffix.slice(0, 12));
    if (preOk && sufOk) {
      matchStart = idx;
      break;
    }
    searchFrom = idx + 1;
  }
  if (matchStart === -1)
    matchStart = full.indexOf(searchText);
  if (matchStart === -1)
    return null;
  const matchEnd = matchStart + searchText.length;
  const startEntry = nodeOffsets.find((o) => o.start <= matchStart && o.end > matchStart);
  const endEntry = nodeOffsets.find((o) => o.start < matchEnd && o.end >= matchEnd);
  if (!startEntry || !endEntry)
    return null;
  const range = document.createRange();
  range.setStart(startEntry.node, matchStart - startEntry.start);
  range.setEnd(endEntry.node, matchEnd - endEntry.start);
  return range;
}
function wrapRange(range, annotation) {
  const span = document.createElement("span");
  span.className = `annotation annotation-${annotation.type}`;
  span.dataset.annotationId = annotation.id;
  if (annotation.type === "comment" && annotation.comment) {
    span.dataset.comment = annotation.comment;
  }
  try {
    range.surroundContents(span);
  } catch {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
  return span;
}
async function applyAnnotationsToDOM() {
  if (!currentArticle)
    return;
  const stored = await chrome.storage.local.get("annotations");
  const all = stored.annotations || [];
  const relevant = all.filter((a) => a.url === currentArticle.url);
  for (const annotation of relevant) {
    if (document.querySelector(`[data-annotation-id="${annotation.id}"]`))
      continue;
    const range = findTextInDOM(articleBody, annotation.text, annotation.prefix, annotation.suffix);
    if (range)
      wrapRange(range, annotation);
  }
}
articleBody.addEventListener("click", async (e) => {
  const span = e.target.closest(".annotation");
  if (!span)
    return;
  const id = span.dataset.annotationId;
  if (!id)
    return;
  if (!highlightsPanel.classList.contains("open")) {
    await renderAnnotationsPanel();
    openPanel(highlightsPanel, btnHighlights);
  }
  requestAnimationFrame(() => {
    const item = highlightsList.querySelector(`[data-annotation-id="${id}"]`);
    if (!item)
      return;
    item.scrollIntoView({ behavior: "smooth", block: "center" });
    item.classList.add("annotation-flash");
    setTimeout(() => item.classList.remove("annotation-flash"), 900);
  });
});
var pendingRange = null;
var commentRange = null;
document.addEventListener("mouseup", (e) => {
  if (e.target.closest("#annotation-toolbar") || e.target.closest("#comment-popup") || e.target.closest("#settings-panel") || e.target.closest("#highlights-panel") || e.target.closest("#read-player") || e.target.closest("#toolbar"))
    return;
  const sel = window.getSelection();
  const text = sel?.toString().trim();
  if (!text || !sel.rangeCount || !articleBody.contains(sel.anchorNode)) {
    hideAnnotationUI();
    return;
  }
  pendingRange = sel.getRangeAt(0).cloneRange();
  positionToolbar(pendingRange);
  annotationToolbar.style.display = "flex";
});
document.addEventListener("mousedown", (e) => {
  if (!e.target.closest("#annotation-toolbar") && !e.target.closest("#comment-popup") && !e.target.closest("#read-player")) {
    hideAnnotationUI();
  }
});
function positionToolbar(range) {
  const rect = range.getBoundingClientRect();
  const approxW = 210;
  let left = rect.left + rect.width / 2 - approxW / 2;
  let top = rect.top - 48 + window.scrollY;
  if (rect.top < 80)
    top = rect.bottom + window.scrollY + 8;
  left = Math.max(8, Math.min(left, window.innerWidth - approxW - 8));
  annotationToolbar.style.left = left + "px";
  annotationToolbar.style.top = top + "px";
}
function hideAnnotationUI() {
  annotationToolbar.style.display = "none";
  commentPopup.style.display = "none";
  pendingRange = null;
}
annotationToolbar.addEventListener("click", async (e) => {
  const btn = e.target.closest(".annotation-tool-btn");
  if (!btn || !pendingRange)
    return;
  const type = btn.dataset.type;
  if (type === "comment") {
    const tbRect = annotationToolbar.getBoundingClientRect();
    commentPopup.style.display = "block";
    commentPopup.style.left = annotationToolbar.style.left;
    commentPopup.style.top = tbRect.bottom + window.scrollY + 4 + "px";
    commentRange = pendingRange;
    commentInput.value = "";
    commentInput.focus();
    return;
  }
  await createAnnotation(type, null, pendingRange);
  hideAnnotationUI();
  window.getSelection()?.removeAllRanges();
});
document.getElementById("comment-save").addEventListener("click", async () => {
  if (!commentRange)
    return;
  await createAnnotation("comment", commentInput.value.trim() || null, commentRange);
  commentInput.value = "";
  commentRange = null;
  hideAnnotationUI();
  window.getSelection()?.removeAllRanges();
});
document.getElementById("comment-cancel").addEventListener("click", () => {
  commentInput.value = "";
  commentRange = null;
  commentPopup.style.display = "none";
});
async function createAnnotation(type, comment, range) {
  if (!currentArticle || !range)
    return;
  const text = range.toString().trim();
  if (!text)
    return;
  const fullText = articleBody.innerText;
  const idx = fullText.indexOf(text);
  const prefix = idx > 0 ? fullText.slice(Math.max(0, idx - 30), idx) : "";
  const suffix = fullText.slice(idx + text.length, idx + text.length + 30);
  const annotation = {
    id: crypto.randomUUID(),
    type,
    text,
    comment: comment || null,
    url: currentArticle.url,
    title: currentArticle.title,
    timestamp: Date.now(),
    prefix,
    suffix
  };
  const stored = await chrome.storage.local.get("annotations");
  const annotations = stored.annotations || [];
  annotations.push(annotation);
  await chrome.storage.local.set({ annotations });
  wrapRange(range, annotation);
  if (highlightsPanel.classList.contains("open"))
    renderAnnotationsPanel();
}
articleBody.addEventListener("mouseover", (e) => {
  const span = e.target.closest(".annotation-comment");
  if (!span?.dataset.comment)
    return;
  annotationTooltip.textContent = span.dataset.comment;
  annotationTooltip.style.display = "block";
});
articleBody.addEventListener("mousemove", (e) => {
  if (annotationTooltip.style.display === "none")
    return;
  annotationTooltip.style.left = e.clientX + 14 + "px";
  annotationTooltip.style.top = e.clientY - 8 + "px";
});
articleBody.addEventListener("mouseout", (e) => {
  if (!e.relatedTarget?.closest(".annotation-comment")) {
    annotationTooltip.style.display = "none";
  }
});
var TYPE_ICON = { highlight: "●", strikethrough: "S̶", comment: "◎" };
var TYPE_LABEL = { highlight: "Highlight", strikethrough: "Strikethrough", comment: "Comment" };
function formatTime(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
async function renderAnnotationsPanel() {
  const stored = await chrome.storage.local.get("annotations");
  const all = stored.annotations || [];
  const relevant = currentArticle?.url ? all.filter((a) => a.url === currentArticle.url) : all;
  if (!relevant.length) {
    highlightsList.innerHTML = '<div class="highlights-empty">No annotations yet.<br>Select text to highlight, strike, or comment.</div>';
    return;
  }
  highlightsList.innerHTML = "";
  relevant.forEach((a) => {
    const item = document.createElement("div");
    item.className = "highlight-item";
    item.dataset.annotationId = a.id;
    item.innerHTML = `
      <div class="annotation-badge annotation-badge-${a.type}">
        ${TYPE_ICON[a.type] || "●"} ${TYPE_LABEL[a.type] || a.type}
      </div>
      <div class="highlight-text annotation-text-${a.type}">${escapeHtml(a.text)}</div>
      ${a.comment ? `<div class="annotation-comment-note">${escapeHtml(a.comment)}</div>` : ""}
      <div class="highlight-meta">
        <span class="highlight-time">${formatTime(a.timestamp)}</span>
        <button class="highlight-delete" data-id="${a.id}">Delete</button>
      </div>
    `;
    item.addEventListener("click", (e) => {
      if (e.target.closest(".highlight-delete"))
        return;
      const el = document.querySelector(`[data-annotation-id="${a.id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("annotation-flash");
        setTimeout(() => el.classList.remove("annotation-flash"), 900);
      }
    });
    highlightsList.appendChild(item);
  });
  highlightsList.querySelectorAll(".highlight-delete").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const stored2 = await chrome.storage.local.get("annotations");
      const arr = (stored2.annotations || []).filter((a) => a.id !== id);
      await chrome.storage.local.set({ annotations: arr });
      const el = document.querySelector(`[data-annotation-id="${id}"]`);
      if (el) {
        const parent = el.parentNode;
        while (el.firstChild)
          parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
      renderAnnotationsPanel();
    });
  });
}
var summaryText = document.getElementById("summary-text");
var summaryCursor = document.getElementById("summary-cursor");
var summaryRegen = document.getElementById("summary-regen");
document.getElementById("close-summary").addEventListener("click", closeAllPanels);
document.getElementById("summary-regen").addEventListener("click", () => {
  if (summaryGenerating)
    return;
  streamSummary();
});
async function streamSummary() {
  if (!currentArticle || summaryGenerating)
    return;
  summaryGenerating = true;
  summaryText.textContent = "";
  summaryCursor.classList.remove("done");
  summaryRegen.style.display = "none";
  btnTldr.classList.add("active");
  const prompt = `Summarize the following article in exactly 5 bullet points using "•" as the bullet character. ` + `Each bullet should be 1–2 sentences: substantive and informative, not just a headline. ` + `Cover the key idea, supporting detail, and any important nuance. Plain text only, no markdown, no headers.

` + `Title: ${currentArticle.title}

` + `${(currentArticle.textContent || "").slice(0, 7000)}`;
  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        Accept: "text/event-stream",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta/llama-4-maverick-17b-128e-instruct",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
        temperature: 0.6,
        top_p: 1,
        stream: true
      })
    });
    if (!response.ok)
      throw new Error(`API error ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder;
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done)
        break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(`
`);
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: "))
          continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]")
          break;
        try {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token)
            summaryText.textContent += token;
        } catch {}
      }
    }
  } catch (err) {
    summaryText.textContent = "Could not generate summary. Check your API key or try again.";
  } finally {
    summaryCursor.classList.add("done");
    summaryRegen.style.display = "";
    summaryGenerating = false;
  }
}
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
init();
