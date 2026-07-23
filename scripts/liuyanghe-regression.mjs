import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { binarizeRgbaPixels, recognizeBinaryScore } from "../app/lib/score-recognition.ts";

const sourcePath = process.argv[2] ?? fileURLToPath(new URL("../tests/fixtures/liuyanghe.jpg", import.meta.url));
const outputPath = process.argv[3] ?? "outputs/liuyanghe-regression.png";

const image = sharp(sourcePath).resize({ width: 1500, withoutEnlargement: true }).ensureAlpha();
const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
const binary = binarizeRgbaPixels(data, info.width, info.height, info.channels);
const result = recognizeBinaryScore(binary);
const labels = result.events.map((event, index) => {
  const color = event.kind === "rest" ? "#267fa0" : "#e33d24";
  return `<g><rect x="${event.x - 10}" y="${event.y - 8}" width="20" height="16" fill="none" stroke="${color}" stroke-width="2"/><text x="${event.x - 8}" y="${event.y - 11}" fill="${color}" font-size="9" font-family="Arial">${index + 1}:${event.written}/${event.beats}</text></g>`;
}).join("");
const overlay = Buffer.from(`<svg width="${info.width}" height="${info.height}" xmlns="http://www.w3.org/2000/svg">${labels}</svg>`);
await mkdir(dirname(outputPath), { recursive: true });
await sharp(sourcePath)
  .resize({ width: info.width, height: info.height, fit: "fill" })
  .composite([{ input: overlay }])
  .png()
  .toFile(outputPath);
const byStaff = Array.from({ length: result.staffCount }, (_, staffIndex) =>
  result.events
    .filter((event) => event.staffIndex === staffIndex)
    .map((event) => `${Math.round(event.x)}@${Math.round(event.y)}=${event.written}:${event.beats}`)
    .join(" "),
);

console.log(JSON.stringify({
  image: { width: info.width, height: info.height, threshold: binary.threshold },
  staffCount: result.staffCount,
  eventCount: result.events.length,
  restCount: result.events.filter((event) => event.kind === "rest").length,
  dottedCount: result.events.filter((event) => event.rhythmMark === "dotted").length,
  overlay: outputPath,
  byStaff,
}, null, 2));
