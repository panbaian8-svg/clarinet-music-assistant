import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  binarizeRgbaPixels,
  recognizeBinaryScore,
} from "../app/lib/score-recognition";

const fixture = fileURLToPath(new URL("./fixtures/liuyanghe.jpg", import.meta.url));

test("recognizes the supplied Liuyang River score without phantom rests or barlines", async () => {
  const { data, info } = await sharp(fixture)
    .resize({ width: 1500, withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const binary = binarizeRgbaPixels(data, info.width, info.height, info.channels);
  const result = recognizeBinaryScore(binary);
  const byStaff = Array.from({ length: result.staffCount }, (_, staffIndex) =>
    result.events.filter((event) => event.staffIndex === staffIndex),
  );

  assert.equal(result.staffCount, 3);
  assert.equal(result.events.length, 69);
  assert.deepEqual(byStaff.map((events) => events.length), [22, 23, 24]);
  assert.equal(result.events.filter((event) => event.kind === "rest").length, 0);
  assert.equal(result.events.filter((event) => event.rhythmMark === "dotted").length, 5);
  assert.ok(result.events.every((event) => !/[♯♭]/u.test(event.written)));

  assert.deepEqual(
    byStaff[0].slice(0, 7).map((event) => event.written),
    ["G5", "A5", "C6", "A5", "G5", "E5", "G5"],
  );
  assert.deepEqual(
    byStaff[0].slice(0, 3).map((event) => event.beats),
    [0.5, 0.25, 0.25],
  );
  assert.deepEqual(
    byStaff[0].slice(14, 17).map((event) => [event.written, event.beats]),
    [["D5", 0.25], ["E5", 0.25], ["C5", 1.5]],
  );
  assert.deepEqual(
    byStaff[2].slice(-5).map((event) => event.written),
    ["C5", "C5", "B4", "G4", "F4"],
  );
  assert.equal(byStaff[2].at(-1)?.beats, 2);
});
