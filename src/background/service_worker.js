chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  // Guard against non-injectable pages
  if (
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("about:") ||
    tab.url.startsWith("edge://")
  ) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/extractor.js"],
    });
  } catch (err) {
    console.error("FocusRead: failed to inject content script", err);
    // Open reader tab with error state
    const readerUrl = chrome.runtime.getURL("reader/index.html");
    await chrome.storage.session.set({
      pendingArticle: null,
      pendingError: "Could not inject content script: " + (err.message || err),
    });
    await chrome.tabs.create({ url: readerUrl });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "ARTICLE_EXTRACTED") return;

  (async () => {
    await chrome.storage.session.set({
      pendingArticle: message.article || null,
      pendingError: message.error || null,
    });

    const readerUrl = chrome.runtime.getURL("reader/index.html");
    await chrome.tabs.create({ url: readerUrl });

    sendResponse({ ok: true });
  })();

  return true; // async response
});
