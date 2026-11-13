import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(rootDir, "dist");
const htmlPath = resolve(distDir, "index.html");
const gzPath = resolve(distDir, "index.html.gz");
const MAX_GZIP_BYTES = 50 * 1024;

if (!existsSync(htmlPath)) {
  console.error("Build error: dist/index.html not found.");
  process.exit(1);
}

const distEntries = readdirSync(distDir);
if (distEntries.includes("assets")) {
  console.error("Build error: dist/assets directory must not exist in single-file mode.");
  process.exit(1);
}

const htmlContent = readFileSync(htmlPath, "utf8");

if (/#(?:fff|ffffff|000|000000)\b/i.test(htmlContent)) {
  console.error("Design check failed: pure #FFFFFF or #000000 detected in bundle.");
  process.exit(1);
}

if (/\u2014/.test(htmlContent)) {
  console.error("Design check failed: em-dash character detected in bundle.");
  process.exit(1);
}

if (/\p{Extended_Pictographic}/u.test(htmlContent)) {
  console.error("Design check failed: Unicode emoji character detected in bundle.");
  process.exit(1);
}

const rawBuffer = Buffer.from(htmlContent, "utf8");
const compressed = gzipSync(rawBuffer, { level: 9 });

if (compressed.byteLength >= MAX_GZIP_BYTES) {
  console.error(
    `Size check failed: index.html.gz is ${compressed.byteLength} bytes (limit < ${MAX_GZIP_BYTES} bytes).`
  );
  process.exit(1);
}

writeFileSync(gzPath, compressed);

const rawKb = (rawBuffer.byteLength / 1024).toFixed(2);
const gzKb = (compressed.byteLength / 1024).toFixed(2);
console.log(
  `Single-file Gzip ready: dist/index.html (${rawKb} KB) -> dist/index.html.gz (${gzKb} KB / ${compressed.byteLength} B)`
);
