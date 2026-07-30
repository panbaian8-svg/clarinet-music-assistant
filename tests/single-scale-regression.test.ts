import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  binarizeRgbaPixels,
  recognizeBinaryScore,
} from "../app/lib/score-recognition";

const fixture = fileURLToPath(new URL("./fixtures/single-scale.png", import.meta.url));

test("keeps adjacent staff positions distinct and separates beamed, quarter, and half notes", async () => {
  const { data, info } = await sharp(fixture)
    .resize({ width: 1500, withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const binary = binarizeRgbaPixels(data, info.width, info.height, info.channels);
  const result = recognizeBinaryScore(binary);
  const events = result.events.filter((event) => event.kind === "note");

  assert.equal(result.staffCount, 1);
  assert.equal(result.events.length, 29);
  assert.equal(result.events.filter((event) => event.kind === "rest").length, 0);
  assert.deepEqual(
    events.map((event) => event.written),
    [
      "C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5",
      "D5", "E5", "F5", "G5", "A5", "B5", "C6",
      "B5", "A5", "G5", "F5", "E5", "D5", "C5", "B4", "A4",
      "G4", "F4", "E4", "D4", "C4",
    ],
  );
  assert.deepEqual(
    events.map((event) => event.beats),
    [
      ...Array(28).fill(0.5),
      2,
    ],
  );
});
