// src/background/service_worker.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "ARTICLE_EXTRACTED")
    return;
  (async () => {
    await chrome.storage.session.set({
      pendingArticle: message.article || null,
      pendingError: message.error || null
    });
    const readerUrl = chrome.runtime.getURL("reader/index.html");
    await chrome.tabs.create({
      url: readerUrl,
      index: sender.tab.index + 1
    });
    sendResponse({ ok: true });
  })();
  return true;
});
