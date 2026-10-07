/**
 * Print the Technical Administration Guide through Chrome.
 *
 * Chrome supports no CSS paged-media margin boxes, so the running header and
 * the page numbers come from puppeteer's own header/footer templates rather
 * than from the stylesheet. See scripts/build-guide.md for the three-step
 * recipe that gives the contents list real page numbers.
 *
 *   node scripts/print-guide.mjs <input.html> <output.pdf>
 *
 * Needs `puppeteer-core` resolvable from the working directory.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const SRC = process.argv[2];
const OUT = process.argv[3];
if (!SRC || !OUT) {
    console.error("usage: node scripts/print-guide.mjs <input.html> <output.pdf>");
    process.exit(1);
}

const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--font-render-hinting=none"],
});
const page = await browser.newPage();
await page.goto(`file:///${SRC}`, { waitUntil: "networkidle0", timeout: 180000 });
// Wait for the web fonts: a fallback serif changes every line break, and the
// page map read back from the first pass would then describe a different book.
await page.evaluateHandle("document.fonts.ready");
await new Promise((r) => setTimeout(r, 1500));

const style =
    "font-family:'IBM Plex Sans',system-ui,sans-serif; font-size:7pt; color:#8C9A93; width:100%; padding:0 14mm;";

await page.pdf({
    path: OUT,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `<div style="${style} display:flex; justify-content:space-between; border-bottom:0.5px solid #E3D9C6; padding-bottom:3px; margin:0 14mm;">
        <span>pApAmA &middot; Technical Administration Guide</span><span>Version 1.2</span></div>`,
    footerTemplate: `<div style="${style} text-align:center;"><span class="pageNumber"></span></div>`,
    margin: { top: "20mm", bottom: "16mm", left: "14mm", right: "14mm" },
});

await browser.close();
console.log(`pdf written: ${OUT}`);
