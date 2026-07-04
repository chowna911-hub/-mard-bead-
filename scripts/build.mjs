import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const outputsDir = path.join(rootDir, "outputs");
const distDir = path.join(rootDir, "dist");

async function removeDir(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function copyDir(fromPath, toPath) {
  await ensureDir(toPath);
  const entries = await fs.readdir(fromPath, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(fromPath, entry.name);
    const targetPath = path.join(toPath, entry.name);

    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath);
    } else {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

async function build() {
  const sourceHtmlPath = path.join(outputsDir, "cyber-beads-matrix-module1.html");
  const targetHtmlPath = path.join(distDir, "index.html");

  await removeDir(distDir);
  await ensureDir(distDir);
  await copyDir(srcDir, path.join(distDir, "src"));
  await fs.copyFile(sourceHtmlPath, targetHtmlPath);

  let html = await fs.readFile(targetHtmlPath, "utf8");
  html = html
    .replace(/\.\.\/src\/styles\.css/g, "./src/styles.css")
    .replace(/\.\.\/src\/app\.js/g, "./src/app.js");
  await fs.writeFile(targetHtmlPath, html, "utf8");

  console.log("Build complete:", distDir);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
