import { Readability, isProbablyReaderable } from "@mozilla/readability";

(function () {
  function countWords(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  let article = null;
  let error = null;

  try {
    const docClone = document.cloneNode(true);
    const readable = isProbablyReaderable(document);

    const reader = new Readability(docClone);
    const parsed = reader.parse();

    if (!parsed) {
      error = "Could not extract readable content from this page.";
    } else {
      const wordCount = countWords(parsed.textContent || "");
      article = {
        title: parsed.title || document.title || "",
        byline: parsed.byline || "",
        content: parsed.content || "",
        textContent: parsed.textContent || "",
        wordCount,
        siteName: parsed.siteName || new URL(document.location.href).hostname,
        url: document.location.href,
        readTime: Math.ceil(wordCount / 238),
        readable,
      };
    }
  } catch (e) {
    error = e.message || "Unknown extraction error.";
  }

  chrome.runtime.sendMessage({
    type: "ARTICLE_EXTRACTED",
    article,
    error,
  });
})();
