export const YAMAHA_FINGERING_SOURCE =
  "https://www.yamaha.com/en/musical_instrument_guide/clarinet/play/play002.html";

export type ClarinetKeyId =
  | "register"
  | "thumb"
  | "gSharp"
  | "aKey"
  | "l1"
  | "l2"
  | "l3"
  | "upperSide"
  | "leftSide"
  | "rightSideInner"
  | "rightSideOuter"
  | "r1"
  | "r2"
  | "r3"
  | "lowerLever"
  | "leftPinkyUpper"
  | "leftPinkyLower";

export type ClarinetRegister = "低音区" | "喉音区" | "中音区" | "高音区";

export type Fingering = {
  keys: ClarinetKeyId[];
  name: string;
  register: ClarinetRegister;
  tip: string;
  sourceIndex: number;
};

export type LessonNote = {
  id: string;
  written: string;
  sounding: string;
  solfege: string;
  beats: number;
  rhythm: string;
  frequency: number;
  staffOffset: number;
  confidence: number;
  source: "demo" | "recognized" | "manual";
  fingering: Fingering;
};

export const CLARINET_KEY_LABELS: Record<ClarinetKeyId, string> = {
  register: "泛音键 R",
  thumb: "左手拇指孔 T",
  gSharp: "喉音 G♯ 键",
  aKey: "A 键",
  l1: "左手食指 L1",
  l2: "左手中指 L2",
  l3: "左手无名指 L3",
  upperSide: "上节侧键",
  leftSide: "左侧小键",
  rightSideInner: "右侧内键",
  rightSideOuter: "右侧外键",
  r1: "右手食指 R1",
  r2: "右手中指 R2",
  r3: "右手无名指 R3",
  lowerLever: "下节联动键",
  leftPinkyUpper: "左手小指上键",
  leftPinkyLower: "左手小指下键",
};

// Standard Boehm-system fingerings transcribed and cross-checked note by note
// against Yamaha's 42-note fingering chart (written E3 through A6).
const STANDARD_FINGERINGS: Record<number, ClarinetKeyId[]> = {
  1: ["thumb", "l1", "l2", "l3", "rightSideInner", "r1", "r2", "r3", "leftPinkyLower"],
  2: ["thumb", "l1", "l2", "l3", "r1", "r2", "r3", "leftPinkyLower"],
  3: ["thumb", "l1", "l2", "l3", "rightSideOuter", "r1", "r2", "r3", "leftPinkyLower"],
  4: ["thumb", "l1", "l2", "l3", "r1", "r2", "r3"],
  5: ["thumb", "l1", "l2", "l3", "r1", "r2", "r3", "leftPinkyUpper"],
  6: ["thumb", "l1", "l2", "l3", "r1", "r2"],
  7: ["thumb", "l1", "l2", "l3", "r1"],
  8: ["thumb", "l1", "l2", "l3", "r2"],
  9: ["thumb", "l1", "l2", "l3"],
  10: ["thumb", "l1", "l2", "upperSide", "l3"],
  11: ["thumb", "l1", "l2"],
  12: ["thumb", "l1", "l2", "leftSide"],
  13: ["thumb", "l1"],
  14: ["thumb"],
  15: ["l1"],
  16: [],
  17: ["gSharp"],
  18: ["aKey"],
  19: ["register", "aKey"],
  20: ["register", "thumb", "l1", "l2", "l3", "rightSideInner", "r1", "r2", "r3", "leftPinkyLower"],
  21: ["register", "thumb", "l1", "l2", "l3", "r1", "r2", "r3", "leftPinkyLower"],
  22: ["register", "thumb", "l1", "l2", "l3", "rightSideOuter", "r1", "r2", "lowerLever", "leftPinkyLower"],
  23: ["register", "thumb", "l1", "l2", "l3", "r1", "r2", "r3"],
  24: ["register", "thumb", "l1", "l2", "l3", "r1", "r2", "r3", "leftPinkyUpper"],
  25: ["register", "thumb", "l1", "l2", "l3", "r1", "r2"],
  26: ["register", "thumb", "l1", "l2", "l3", "r1"],
  27: ["register", "thumb", "l1", "l2", "l3", "r2"],
  28: ["register", "thumb", "l1", "l2", "l3"],
  29: ["register", "thumb", "l1", "l2", "upperSide", "l3"],
  30: ["register", "thumb", "l1", "l2"],
  31: ["register", "thumb", "l1", "l2", "leftSide"],
  32: ["register", "thumb", "l1"],
  33: ["register", "thumb"],
  34: ["register", "thumb", "l2", "l3", "r1", "r2"],
  35: ["register", "thumb", "l2", "l3", "r1", "leftPinkyUpper"],
  36: ["register", "thumb", "l2", "l3", "r1", "lowerLever", "leftPinkyUpper"],
  37: ["register", "thumb", "l2", "l3", "leftPinkyUpper"],
  38: ["register", "thumb", "l2", "upperSide", "l3", "leftPinkyUpper"],
  39: ["register", "thumb", "l2", "leftPinkyUpper"],
  40: ["register", "thumb", "l2", "r1", "r2", "leftPinkyUpper"],
  41: ["register", "thumb", "l2", "l3", "r1", "lowerLever", "leftPinkyUpper"],
  42: ["register", "thumb", "l2", "l3", "rightSideOuter", "leftPinkyUpper"],
};

const SHARP_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
const SOLFEGE = ["Do", "Do♯", "Re", "Mi♭", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "Si♭", "Si"];
const RHYTHM_NAMES: Record<number, string> = {
  0.5: "八分音符",
  1: "四分音符",
  2: "二分音符",
  4: "全音符",
};

const normalizeAccidentals = (value: string) =>
  value.replaceAll("#", "♯").replaceAll("b", "♭").trim();

export function pitchToMidi(pitch: string): number {
  const normalized = normalizeAccidentals(pitch);
  const match = normalized.match(/^([A-G])(♯|♭)?(-?\d)$/);
  if (!match) return 67;
  const [, letter, accidental, octaveText] = match;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const offset = accidental === "♯" ? 1 : accidental === "♭" ? -1 : 0;
  return (Number(octaveText) + 1) * 12 + base[letter] + offset;
}

export function midiToPitch(midi: number, preferFlats = false): string {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${(preferFlats ? FLAT_NAMES : SHARP_NAMES)[pitchClass]}${octave}`;
}

export function noteFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function getClarinetRegister(midi: number): ClarinetRegister {
  if (midi <= 66) return "低音区";
  if (midi <= 70) return "喉音区";
  if (midi <= 85) return "中音区";
  return "高音区";
}

export function getFingering(pitch: string): Fingering {
  const midi = pitchToMidi(pitch);
  const sourceIndex = Math.min(42, Math.max(1, midi - 51));
  const register = getClarinetRegister(midi);
  const keys = STANDARD_FINGERINGS[sourceIndex] ?? [];
  const name = keys.length === 0 ? "开放指法" : `${register}标准指法`;
  const tip =
    register === "高音区"
      ? "高音区对口型和气流很敏感。先按图落指，再用更集中、速度更快的气流发音。"
      : register === "喉音区"
        ? "喉音区手指动作很小，保持右手托稳，避免为了找键而改变口型。"
        : "橙色位置表示需要按下或会联动闭合；每个音孔都要由指腹完整盖严。";
  return { keys, name, register, tip, sourceIndex };
}

function diatonicStaffOffset(pitch: string): number {
  const normalized = normalizeAccidentals(pitch);
  const match = normalized.match(/^([A-G])(?:♯|♭)?(-?\d)$/);
  if (!match) return 19;
  const letters = ["C", "D", "E", "F", "G", "A", "B"];
  const [, letter, octaveText] = match;
  const stepsFromC4 = (Number(octaveText) - 4) * 7 + letters.indexOf(letter);
  return -13 + stepsFromC4 * 8;
}

export function buildLessonNote(
  written: string,
  beats = 1,
  options: Partial<Pick<LessonNote, "id" | "confidence" | "source">> = {},
): LessonNote {
  const normalized = normalizeAccidentals(written);
  const midi = pitchToMidi(normalized);
  const pitchClass = ((midi % 12) + 12) % 12;
  return {
    id: options.id ?? `${normalized}-${crypto.randomUUID()}`,
    written: normalized,
    sounding: midiToPitch(midi - 2, true),
    solfege: SOLFEGE[pitchClass],
    beats,
    rhythm: RHYTHM_NAMES[beats] ?? `${beats} 拍`,
    frequency: noteFrequency(midi - 2),
    staffOffset: diatonicStaffOffset(normalized),
    confidence: options.confidence ?? 1,
    source: options.source ?? "manual",
    fingering: getFingering(normalized),
  };
}

export const CLARINET_RANGE = Array.from({ length: 42 }, (_, index) => {
  const midi = 52 + index;
  const sharp = midiToPitch(midi);
  const flat = midiToPitch(midi, true);
  return {
    midi,
    value: sharp,
    label: sharp === flat ? sharp : `${sharp} / ${flat}`,
    register: getClarinetRegister(midi),
    fingering: getFingering(sharp),
  };
});

export const DEMO_LESSON: LessonNote[] = [
  buildLessonNote("C4", 1, { id: "demo-c4", source: "demo" }),
  buildLessonNote("D4", 1, { id: "demo-d4", source: "demo" }),
  buildLessonNote("E4", 1, { id: "demo-e4", source: "demo" }),
  buildLessonNote("F4", 1, { id: "demo-f4", source: "demo" }),
  buildLessonNote("G4", 2, { id: "demo-g4", source: "demo" }),
  buildLessonNote("A4", 1, { id: "demo-a4", source: "demo" }),
  buildLessonNote("G4", 1, { id: "demo-g4-end", source: "demo" }),
];
