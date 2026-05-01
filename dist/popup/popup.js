// src/popup/popup.js
var openBtn = document.getElementById("open-btn");
var status = document.getElementById("status");
openBtn.addEventListener("click", async () => {
  openBtn.disabled = true;
  status.textContent = "Extracting…";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url) {
    status.textContent = "No active tab found.";
    openBtn.disabled = false;
    return;
  }
  if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("about:") || tab.url.startsWith("edge://")) {
    status.textContent = "Cannot read browser pages.";
    openBtn.disabled = false;
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/extractor.js"]
    });
    window.close();
  } catch (err) {
    status.textContent = "Extraction failed. Try again.";
    openBtn.disabled = false;
  }
});
