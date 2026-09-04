import { copyFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { spawnSync } from "child_process";

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

  const nvidiaKey = process.env.NVIDIA_API_KEY ?? "";
  if (!nvidiaKey) console.warn("Warning: NVIDIA_API_KEY not set in .env.local");

  const edgeTtsUrl = process.env.EDGE_TTS_API_URL ?? "http://localhost:3001/api/tts";
  if (!process.env.EDGE_TTS_API_URL) console.warn("Warning: EDGE_TTS_API_URL not set in .env.local, using default");

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
      __NVIDIA_API_KEY__: JSON.stringify(nvidiaKey),
      __EDGE_TTS_API_URL__: JSON.stringify(edgeTtsUrl),
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

  // Resize brand logo into required icon sizes
  const logo = "icons/readr.png";
  for (const size of [16, 48, 128]) {
    spawnSync("sips", ["-z", String(size), String(size), logo, "--out", `${outdir}/icons/icon${size}.png`]);
  }

  console.log("Static files copied.");
  console.log(`\nBuild complete → ${outdir}/`);
  console.log("Load unpacked from chrome://extensions → select dist/");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
