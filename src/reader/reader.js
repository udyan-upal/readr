// State
let currentArticle = null;
let currentSettings = { theme: "light", font: "inter", size: "medium" };
let settingsOpen = false;
let highlightsOpen = false;

// DOM refs
const progressBar = document.getElementById("progress-bar");
const body = document.body;

const loadingState = document.getElementById("loading-state");
const articleContainer = document.getElementById("article-container");
const errorState = document.getElementById("error-state");
const errorMessage = document.getElementById("error-message");

const siteNameEl = document.getElementById("site-name");
const originalUrlEl = document.getElementById("original-url");
const readTimeEl = document.getElementById("read-time");
const bylineEl = document.getElementById("byline");
const titleEl = document.getElementById("article-title");
const articleBody = document.getElementById("article-body");

const btnHighlights = document.getElementById("btn-highlights");
const btnSettings = document.getElementById("btn-settings");

const settingsPanel = document.getElementById("settings-panel");
const highlightsPanel = document.getElementById("highlights-panel");

const closeSettings = document.getElementById("close-settings");
const closeHighlights = document.getElementById("close-highlights");

const highlightSaveBtn = document.getElementById("highlight-save-btn");
const highlightsList = document.getElementById("highlights-list");

// --- Init ---

async function init() {
  const saved = await chrome.storage.local.get(["theme", "font", "size"]);
  currentSettings.theme = saved.theme || "light";
  currentSettings.font = saved.font || "inter";
  currentSettings.size = saved.size || "medium";

  applySettings();
  updateSettingsUI();

  // Always watch for incoming article data (handles re-extractions too)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "session") return;
    if (!("pendingArticle" in changes) && !("pendingError" in changes)) return;

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
  // else: stay on loading state until storage.onChanged fires
}

// --- Render ---

function renderArticle(article) {
  document.title = article.title ? `${article.title} — readr` : "readr";

  siteNameEl.textContent = article.siteName || "";
  originalUrlEl.textContent = article.url || "";
  originalUrlEl.href = article.url || "#";

  if (article.readTime) {
    readTimeEl.textContent = `${article.readTime} min read`;
  }

  if (article.byline) {
    bylineEl.textContent = article.byline;
    bylineEl.style.display = "";
  } else {
    bylineEl.style.display = "none";
  }

  titleEl.textContent = article.title || "";
  articleBody.innerHTML = article.content || "";

  // Open links in new tab
  articleBody.querySelectorAll("a").forEach((a) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  });

  articleContainer.style.display = "";
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorState.style.display = "";
}

// --- Settings ---

function applySettings() {
  body.setAttribute("data-theme", currentSettings.theme);

  articleBody.className = "";
  articleBody.classList.add(`font-${currentSettings.font}`, `font-${currentSettings.size}`);
}

function updateSettingsUI() {
  document.querySelectorAll("#theme-group .option-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.value === currentSettings.theme);
  });
  document.querySelectorAll("#font-group .option-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.value === currentSettings.font);
  });
  document.querySelectorAll("#size-group .option-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.value === currentSettings.size);
  });
}

async function saveSetting(key, value) {
  currentSettings[key] = value;
  await chrome.storage.local.set({ [key]: value });
  applySettings();
  updateSettingsUI();
}

document.getElementById("theme-group").addEventListener("click", (e) => {
  const btn = e.target.closest(".option-btn");
  if (btn) saveSetting("theme", btn.dataset.value);
});

document.getElementById("font-group").addEventListener("click", (e) => {
  const btn = e.target.closest(".option-btn");
  if (btn) saveSetting("font", btn.dataset.value);
});

document.getElementById("size-group").addEventListener("click", (e) => {
  const btn = e.target.closest(".option-btn");
  if (btn) saveSetting("size", btn.dataset.value);
});

// --- Panel toggles ---

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
  if (settingsPanel.classList.contains("open")) {
    closeAllPanels();
  } else {
    openPanel(settingsPanel, btnSettings);
  }
});

btnHighlights.addEventListener("click", () => {
  if (highlightsPanel.classList.contains("open")) {
    closeAllPanels();
  } else {
    renderHighlights();
    openPanel(highlightsPanel, btnHighlights);
  }
});

closeSettings.addEventListener("click", closeAllPanels);
closeHighlights.addEventListener("click", closeAllPanels);

// --- Progress bar ---

window.addEventListener("scroll", () => {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  progressBar.style.width = `${Math.min(100, pct)}%`;
});

// --- Highlight & Save ---

let pendingSelection = null;

document.addEventListener("mouseup", (e) => {
  if (
    e.target.closest("#settings-panel") ||
    e.target.closest("#highlights-panel") ||
    e.target.closest("#toolbar")
  ) {
    return;
  }

  const sel = window.getSelection();
  const text = sel ? sel.toString().trim() : "";

  if (!text) {
    highlightSaveBtn.style.display = "none";
    pendingSelection = null;
    return;
  }

  pendingSelection = text;

  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  highlightSaveBtn.style.display = "block";
  highlightSaveBtn.style.top = `${rect.bottom + window.scrollY + 8}px`;
  highlightSaveBtn.style.left = `${rect.left + window.scrollX}px`;
});

document.addEventListener("mousedown", (e) => {
  if (e.target !== highlightSaveBtn) {
    highlightSaveBtn.style.display = "none";
  }
});

highlightSaveBtn.addEventListener("click", async () => {
  if (!pendingSelection || !currentArticle) return;

  const highlight = {
    text: pendingSelection,
    url: currentArticle.url,
    title: currentArticle.title,
    timestamp: Date.now(),
  };

  const stored = await chrome.storage.local.get("highlights");
  const highlights = stored.highlights || [];
  highlights.push(highlight);
  await chrome.storage.local.set({ highlights });

  highlightSaveBtn.style.display = "none";
  pendingSelection = null;
  window.getSelection()?.removeAllRanges();

  // Refresh highlights panel if open
  if (highlightsPanel.classList.contains("open")) {
    renderHighlights();
  }
});

// --- Highlights panel rendering ---

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

async function renderHighlights() {
  const stored = await chrome.storage.local.get("highlights");
  const all = stored.highlights || [];
  const url = currentArticle ? currentArticle.url : null;
  const relevant = url ? all.filter((h) => h.url === url) : all;

  if (!relevant.length) {
    highlightsList.innerHTML = '<div class="highlights-empty">No highlights for this article yet.</div>';
    return;
  }

  highlightsList.innerHTML = "";
  relevant.forEach((h, idx) => {
    const globalIdx = all.indexOf(h);
    const item = document.createElement("div");
    item.className = "highlight-item";
    item.innerHTML = `
      <div class="highlight-text">${escapeHtml(h.text)}</div>
      <div class="highlight-meta">
        <span class="highlight-time">${formatTime(h.timestamp)}</span>
        <button class="highlight-delete" data-idx="${globalIdx}">Delete</button>
      </div>
    `;
    highlightsList.appendChild(item);
  });

  highlightsList.querySelectorAll(".highlight-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const i = parseInt(btn.dataset.idx, 10);
      const stored2 = await chrome.storage.local.get("highlights");
      const arr = stored2.highlights || [];
      arr.splice(i, 1);
      await chrome.storage.local.set({ highlights: arr });
      renderHighlights();
    });
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Start
init();
