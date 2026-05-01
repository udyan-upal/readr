import { copyFile, mkdir, cp } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

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

  // Copy icons
  for (const icon of ["icon16.png", "icon48.png", "icon128.png"]) {
    await copyFile(`icons/${icon}`, `${outdir}/icons/${icon}`);
  }

  console.log("Static files copied.");
  console.log(`\nBuild complete → ${outdir}/`);
  console.log("Load unpacked from chrome://extensions → select dist/");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
