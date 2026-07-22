export const YAMAHA_FINGERING_SOURCE =
  "https://www.yamaha.com/en/musical_instrument_guide/clarinet/play/play002.html";

export type ClarinetRegister = "低音区" | "喉音区" | "中音区" | "高音区";

export type FingeringVariant = {
  id: string;
  name: "主指法" | "替代指法";
  asset: string;
  variantIndex: number;
  sourceIndex: number;
};

export type Fingering = {
  variants: FingeringVariant[];
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

// Yamaha's chart contains 42 written pitches and 19 explicitly marked
// alternate fingerings. Each fingering is exported as its own standard chart.
export const ALTERNATE_FINGERING_SOURCE_INDICES = new Set([
  1, 2, 3, 8, 12, 15, 19, 20, 21, 22, 27, 31, 34, 35, 36, 38, 39, 40, 41,
]);
export const TOTAL_FINGERING_VARIANTS = 42 + ALTERNATE_FINGERING_SOURCE_INDICES.size;

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
  const chartPitch = midiToPitch(sourceIndex + 51);
  const assetStem = chartPitch.toLowerCase().replace("♯", "s");
  const variants: FingeringVariant[] = [
    {
      id: `${assetStem}-primary`,
      name: "主指法",
      asset: `/fingerings/${assetStem}-primary.webp`,
      variantIndex: 1,
      sourceIndex,
    },
  ];
  if (ALTERNATE_FINGERING_SOURCE_INDICES.has(sourceIndex)) {
    variants.push({
      id: `${assetStem}-alternate`,
      name: "替代指法",
      asset: `/fingerings/${assetStem}-alternate.webp`,
      variantIndex: 2,
      sourceIndex,
    });
  }
  const name = `${register} · ${variants.length} 套指法`;
  const tip =
    register === "高音区"
      ? "高音区对口型和气流很敏感。先按图落指，再用更集中、速度更快的气流发音。"
      : register === "喉音区"
        ? "喉音区手指动作很小，保持右手托稳，避免为了找键而改变口型。"
        : "红色位置表示需要按下或会联动闭合；每个音孔都要由指腹完整盖严。";
  return { variants, name, register, tip, sourceIndex };
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
