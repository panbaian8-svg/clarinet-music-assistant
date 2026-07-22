import assert from "node:assert/strict";
import test from "node:test";
import { CLARINET_RANGE, buildLessonNote } from "../app/lib/clarinet";
import { detectStaves, pitchFromStaffStep } from "../app/lib/score-recognition";

test("detects one evenly spaced five-line staff", () => {
  const width = 400;
  const height = 160;
  const data = new Uint8Array(width * height);
  for (const y of [50, 60, 70, 80, 90]) {
    for (let x = 20; x <= 380; x += 1) data[y * width + x] = 1;
  }
  const staves = detectStaves({ data, width, height, threshold: 160 });
  assert.equal(staves.length, 1);
  assert.ok(Math.abs(staves[0].spacing - 10) < 0.1);
});

test("maps treble-staff positions to written pitches", () => {
  assert.equal(pitchFromStaffStep(0, ""), "E4");
  assert.equal(pitchFromStaffStep(1, ""), "F4");
  assert.equal(pitchFromStaffStep(-1, "♭"), "D♭4");
  assert.equal(pitchFromStaffStep(7, "♯"), "E♯5");
});

test("covers all 42 Yamaha standard fingerings and transposes sounding pitch", () => {
  assert.equal(CLARINET_RANGE.length, 42);
  assert.equal(CLARINET_RANGE[0].value, "E3");
  assert.equal(CLARINET_RANGE[CLARINET_RANGE.length - 1].value, "A6");
  assert.equal(CLARINET_RANGE[0].fingering.sourceIndex, 1);
  assert.equal(CLARINET_RANGE[CLARINET_RANGE.length - 1].fingering.sourceIndex, 42);
  assert.equal(buildLessonNote("C4").sounding, "B♭3");
});
