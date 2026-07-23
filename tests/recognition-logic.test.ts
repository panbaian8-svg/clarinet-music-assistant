import assert from "node:assert/strict";
import test from "node:test";
import {
  ALTERNATE_FINGERING_SOURCE_INDICES,
  CLARINET_RANGE,
  TOTAL_FINGERING_VARIANTS,
  buildLessonNote,
  buildRestEvent,
} from "../app/lib/clarinet";
import {
  applyRhythmMarks,
  classifyRestGlyph,
  detectStaves,
  pitchFromStaffStep,
} from "../app/lib/score-recognition";

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

test("covers 42 pitches and all 61 separated Yamaha fingering charts", () => {
  assert.equal(CLARINET_RANGE.length, 42);
  assert.equal(ALTERNATE_FINGERING_SOURCE_INDICES.size, 19);
  assert.equal(TOTAL_FINGERING_VARIANTS, 61);
  assert.equal(CLARINET_RANGE.reduce((total, entry) => total + entry.fingering.variants.length, 0), 61);
  assert.equal(CLARINET_RANGE[0].value, "E3");
  assert.equal(CLARINET_RANGE[CLARINET_RANGE.length - 1].value, "A6");
  assert.equal(CLARINET_RANGE[0].fingering.variants.length, 2);
  assert.equal(CLARINET_RANGE[3].fingering.variants.length, 1);
  assert.equal(CLARINET_RANGE[0].fingering.sourceIndex, 1);
  assert.equal(CLARINET_RANGE[CLARINET_RANGE.length - 1].fingering.sourceIndex, 42);
  assert.equal(buildLessonNote("C4").sounding, "B♭3");
});

test("applies beam subdivisions and augmentation dots", () => {
  assert.equal(applyRhythmMarks(1, 2, false), 0.25);
  assert.equal(applyRhythmMarks(1, 1, false), 0.5);
  assert.equal(applyRhythmMarks(1, 1, true), 0.75);
  assert.equal(applyRhythmMarks(2, 0, true), 3);
});

test("classifies the five supported rest families", () => {
  assert.equal(classifyRestGlyph({ widthRatio: 1.1, heightRatio: 0.4, centerOffset: -0.8, density: 0.4, lobeCount: 1 })?.restType, "whole");
  assert.equal(classifyRestGlyph({ widthRatio: 1.1, heightRatio: 0.4, centerOffset: 0, density: 0.4, lobeCount: 1 })?.restType, "half");
  assert.equal(classifyRestGlyph({ widthRatio: 0.8, heightRatio: 3, centerOffset: 0, density: 0.3, lobeCount: 1 })?.restType, "quarter");
  assert.equal(classifyRestGlyph({ widthRatio: 0.8, heightRatio: 1.7, centerOffset: 0, density: 0.3, lobeCount: 2 })?.restType, "eighth");
  assert.equal(classifyRestGlyph({ widthRatio: 0.9, heightRatio: 3, centerOffset: 0, density: 0.3, lobeCount: 4 })?.restType, "sixteenth");
});

test("builds silent rest events for the editable timeline", () => {
  const rest = buildRestEvent(0.75, { id: "test-rest", source: "recognized" });
  assert.equal(rest.kind, "rest");
  assert.equal(rest.restType, "eighth");
  assert.equal(rest.rhythm, "附点八分休止符");
  assert.equal(rest.frequency, 0);
  assert.equal(rest.fingering, null);
});
