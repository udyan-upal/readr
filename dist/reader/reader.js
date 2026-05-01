// src/reader/reader.js
var currentArticle = null;
var currentSettings = { theme: "light", font: "inter", size: "medium" };
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
var btnHighlights = document.getElementById("btn-highlights");
var btnSettings = document.getElementById("btn-settings");
var settingsPanel = document.getElementById("settings-panel");
var highlightsPanel = document.getElementById("highlights-panel");
var closeSettings = document.getElementById("close-settings");
var closeHighlights = document.getElementById("close-highlights");
var highlightsList = document.getElementById("highlights-list");
var annotationToolbar = document.getElementById("annotation-toolbar");
var commentPopup = document.getElementById("comment-popup");
var commentInput = document.getElementById("comment-input");
var annotationTooltip = document.getElementById("annotation-tooltip");
async function init() {
  const saved = await chrome.storage.local.get(["theme", "font", "size"]);
  currentSettings.theme = saved.theme || "light";
  currentSettings.font = saved.font || "inter";
  currentSettings.size = saved.size || "medium";
  applySettings();
  updateSettingsUI();
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
function openPanel(panel, btnEl) {
  settingsPanel.classList.remove("open");
  highlightsPanel.classList.remove("open");
  btnHighlights.classList.remove("active");
  btnSettings.classList.remove("active");
  panel.classList.add("open");
  btnEl.classList.add("active");
}
function closeAllPanels() {
  settingsPanel.classList.remove("open");
  highlightsPanel.classList.remove("open");
  btnHighlights.classList.remove("active");
  btnSettings.classList.remove("active");
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
closeSettings.addEventListener("click", closeAllPanels);
closeHighlights.addEventListener("click", closeAllPanels);
window.addEventListener("scroll", () => {
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const pct = docHeight > 0 ? window.scrollY / docHeight * 100 : 0;
  progressBar.style.width = `${Math.min(100, pct)}%`;
});
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
  if (e.target.closest("#annotation-toolbar") || e.target.closest("#comment-popup") || e.target.closest("#settings-panel") || e.target.closest("#highlights-panel") || e.target.closest("#toolbar"))
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
  if (!e.target.closest("#annotation-toolbar") && !e.target.closest("#comment-popup")) {
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
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
init();
