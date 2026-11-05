import { copyFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

const outdir = "dist";

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

async function build() {
  await ensureDir(outdir);
  await ensureDir(`${outdir}/reader`);
  await ensureDir(`${outdir}/popup`);
  await ensureDir(`${outdir}/icons`);

  const openRouterKey = process.env.OPENROUTER_API_KEY ?? "";
  const openRouterModel = process.env.OPENROUTER_MODEL ?? "";
  const nvidiaKey = process.env.NVIDIA_API_KEY ?? "";
  const hasOpenRouter = Boolean(openRouterKey && openRouterModel);

  if (!hasOpenRouter && (openRouterKey || openRouterModel)) {
    console.warn("Warning: both OPENROUTER_API_KEY and OPENROUTER_MODEL are required");
  }
  if (!hasOpenRouter && !nvidiaKey) {
    console.warn("Warning: no AI provider configured in .env.local");
  } else if (!hasOpenRouter) {
    console.warn("Warning: OpenRouter not configured; using NVIDIA only");
  } else if (!nvidiaKey) {
    console.warn("Warning: NVIDIA_API_KEY not set; OpenRouter has no fallback");
  }

  const edgeTtsUrl = process.env.EDGE_TTS_API_URL ?? "http://localhost:3030/api/tts";
  if (!process.env.EDGE_TTS_API_URL) console.warn("Warning: EDGE_TTS_API_URL not set in .env.local, using default");

  const edgeTtsToken = process.env.EDGE_TTS_API_TOKEN ?? "";
  if (!edgeTtsToken) console.warn("Warning: EDGE_TTS_API_TOKEN not set; a deployed /api/tts will reject read-aloud requests");

  const results = await Bun.build({
    entrypoints: [
      "src/content/extractor.js",
      "src/background/service_worker.js",
      "src/reader/reader.js",
      "src/popup/popup.js",
    ],
    outdir,
    target: "browser",
    minify: false,
    splitting: false,
    define: {
      __OPENROUTER_API_KEY__: JSON.stringify(openRouterKey),
      __OPENROUTER_MODEL__: JSON.stringify(openRouterModel),
      __NVIDIA_API_KEY__: JSON.stringify(nvidiaKey),
      __EDGE_TTS_API_URL__: JSON.stringify(edgeTtsUrl),
      __EDGE_TTS_API_TOKEN__: JSON.stringify(edgeTtsToken),
    },
  });

  if (!results.success) {
    console.error("Build failed:");
    for (const msg of results.logs) {
      console.error(msg);
    }
    process.exit(1);
  }

  console.log("JS bundles built.");

  // Copy static files
  await copyFile("manifest.json", `${outdir}/manifest.json`);
  await copyFile("src/reader/index.html", `${outdir}/reader/index.html`);
  await copyFile("src/reader/reader.css", `${outdir}/reader/reader.css`);
  await copyFile("src/popup/popup.html", `${outdir}/popup/popup.html`);
  await copyFile("icons/readr.png", `${outdir}/icons/readr.png`);
  await copyFile("icons/readr-nobg.png", `${outdir}/icons/readr-nobg.png`);
  await copyFile("icons/readr-wordmark.svg", `${outdir}/icons/readr-wordmark.svg`);
  await copyFile("icons/readr-stacked.svg", `${outdir}/icons/readr-stacked.svg`);

  // The identity kit ships hand-tuned 16/48/128 px cuts (the 16 px mark uses
  // three bars), so copy them instead of resampling one large file.
  for (const size of [16, 48, 128]) {
    await copyFile(`icons/icon${size}.png`, `${outdir}/icons/icon${size}.png`);
  }

  console.log("Static files copied.");
  console.log(`\nBuild complete → ${outdir}/`);
  console.log("Load unpacked from chrome://extensions → select dist/");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
