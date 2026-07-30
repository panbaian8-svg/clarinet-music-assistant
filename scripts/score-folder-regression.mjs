import sharp from "sharp";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import {
  binarizeRgbaPixels,
  recognizeBinaryScore,
} from "../app/lib/score-recognition.ts";

const sourceDirectory = resolve(process.argv[2] ?? "C:/Users/SYL/Desktop/乐谱");
const outputDirectory = resolve(process.argv[3] ?? "outputs/score-folder-regression");
const supportedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"]);

await mkdir(outputDirectory, { recursive: true });
const files = (await readdir(sourceDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && supportedExtensions.has(extname(entry.name).toLowerCase()))
  .map((entry) => join(sourceDirectory, entry.name))
  .sort((left, right) => left.localeCompare(right, "zh-CN"));

const reports = [];
for (const sourcePath of files) {
  const image = sharp(sourcePath).resize({ width: 1500, withoutEnlargement: true }).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const binary = binarizeRgbaPixels(data, info.width, info.height, info.channels);
  const result = recognizeBinaryScore(binary);
  const labels = result.events.map((event, index) => {
    const color = event.kind === "rest" ? "#087e8b" : event.articulation === "tongued" ? "#e33d24" : "#8d35ad";
    const label = `${index + 1}:${event.written}/${event.beats}`;
    return `<g>
      <rect x="${event.x - 10}" y="${event.y - 8}" width="20" height="16" fill="none" stroke="${color}" stroke-width="2"/>
      <text x="${event.x - 10}" y="${event.y - 11}" fill="${color}" font-size="10" font-family="Arial" font-weight="700">${label}</text>
    </g>`;
  }).join("");
  const overlay = Buffer.from(
    `<svg width="${info.width}" height="${info.height}" xmlns="http://www.w3.org/2000/svg">${labels}</svg>`,
  );
  const overlayPath = join(outputDirectory, `${basename(sourcePath, extname(sourcePath))}.overlay.png`);
  await mkdir(dirname(overlayPath), { recursive: true });
  await sharp(sourcePath)
    .resize({ width: info.width, height: info.height, fit: "fill" })
    .composite([{ input: overlay }])
    .png()
    .toFile(overlayPath);

  const eventsByStaff = Array.from({ length: result.staffCount }, (_, staffIndex) =>
    result.events
      .filter((event) => event.staffIndex === staffIndex)
      .map((event) => ({
        written: event.written,
        beats: event.beats,
        articulation: event.articulation,
        x: Math.round(event.x),
        y: Math.round(event.y),
        measureIndex: event.measureIndex,
        headCoreDensity: event.headCoreDensity,
        headRingDensity: event.headRingDensity,
        headFillConfidence: event.headFillConfidence,
        subdivisionCount: event.subdivisionCount,
        beamToPrevious: event.beamToPrevious,
        beamToNext: event.beamToNext,
        primaryBeamSpan: event.primaryBeamSpan,
        primaryBeamCoverage: event.primaryBeamCoverage,
        secondaryBeamSpan: event.secondaryBeamSpan,
        secondaryBeamCoverage: event.secondaryBeamCoverage,
      })),
  );
  reports.push({
    sourcePath,
    overlayPath,
    image: { width: info.width, height: info.height, threshold: binary.threshold },
    staffCount: result.staffCount,
    eventCount: result.events.length,
    noteCount: result.events.filter((event) => event.kind === "note").length,
    restCount: result.events.filter((event) => event.kind === "rest").length,
    meterBeats: result.meterBeats,
    dottedCount: result.events.filter((event) => event.rhythmMark === "dotted").length,
    slurCount: result.slurCount,
    durationHistogram: Object.groupBy(result.events, (event) => String(event.beats)),
    staffEventCounts: eventsByStaff.map((events) => events.length),
    eventsByStaff,
  });
}

const reportPath = join(outputDirectory, "report.json");
await writeFile(reportPath, `${JSON.stringify(reports, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  sourceDirectory,
  reportPath,
  images: reports.map((report) => ({
    file: basename(report.sourcePath),
    staffCount: report.staffCount,
    eventCount: report.eventCount,
    restCount: report.restCount,
    meterBeats: report.meterBeats,
    dottedCount: report.dottedCount,
    slurCount: report.slurCount,
    staffEventCounts: report.staffEventCounts,
    overlayPath: report.overlayPath,
  })),
}, null, 2));
