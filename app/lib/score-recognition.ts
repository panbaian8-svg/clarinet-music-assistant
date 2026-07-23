import {
  buildLessonNote,
  buildRestEvent,
  type LessonNote,
  type RestType,
} from "./clarinet";

export type RecognitionResult = {
  notes: LessonNote[];
  staffCount: number;
  confidence: number;
  deskewDegrees: number;
  previewDataUrl: string;
  warning: string | null;
  restCount: number;
  dottedCount: number;
  subdivisionCount: number;
};

type Staff = {
  lines: number[];
  spacing: number;
  left: number;
  right: number;
};

type NoteCandidate = {
  kind: "note";
  staffIndex: number;
  x: number;
  y: number;
  step: number;
  score: number;
  filled: boolean;
  stemUp: boolean;
  stemTop: number;
  beats: number;
  accidental: "♯" | "♭" | "";
  dotted: boolean;
  subdivisionCount: number;
  stemX: number;
};

type RestCandidate = {
  kind: "rest";
  staffIndex: number;
  x: number;
  y: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  score: number;
  beats: number;
  dotted: boolean;
  restType: RestType;
};

type Candidate = NoteCandidate | RestCandidate;

export type RestGlyphFeatures = {
  widthRatio: number;
  heightRatio: number;
  centerOffset: number;
  density: number;
  lobeCount: number;
};

type BinaryImage = {
  data: Uint8Array;
  width: number;
  height: number;
  threshold: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function applyRhythmMarks(baseBeats: number, subdivisionCount: number, dotted: boolean) {
  const subdivided = subdivisionCount > 0 ? 1 / Math.pow(2, subdivisionCount) : baseBeats;
  return subdivided * (dotted ? 1.5 : 1);
}

export function classifyRestGlyph(features: RestGlyphFeatures): {
  restType: RestType;
  beats: number;
  confidence: number;
} | null {
  const { widthRatio, heightRatio, centerOffset, density, lobeCount } = features;
  if (density < 0.055 || density > 0.92) return null;

  if (
    widthRatio >= 0.5 && widthRatio <= 2.15 &&
    heightRatio >= 0.12 && heightRatio <= 0.82 &&
    centerOffset >= -1.35 && centerOffset <= 0.35
  ) {
    const whole = centerOffset < -0.48;
    return {
      restType: whole ? "whole" : "half",
      beats: whole ? 4 : 2,
      confidence: clamp(0.76 - Math.abs(widthRatio - 1.1) * 0.08, 0.58, 0.9),
    };
  }

  if (
    widthRatio >= 0.5 && widthRatio <= 1.95 &&
    heightRatio >= 2.05 && heightRatio <= 3.95 &&
    lobeCount >= 3
  ) {
    return { restType: "sixteenth", beats: 0.25, confidence: clamp(0.58 + lobeCount * 0.05, 0.62, 0.86) };
  }

  if (
    widthRatio >= 0.4 && widthRatio <= 1.85 &&
    heightRatio >= 1.05 && heightRatio <= 2.55 &&
    lobeCount <= 2
  ) {
    return { restType: "eighth", beats: 0.5, confidence: clamp(0.74 - Math.abs(heightRatio - 1.75) * 0.08, 0.6, 0.86) };
  }

  if (
    widthRatio >= 0.34 && widthRatio <= 1.55 &&
    heightRatio >= 1.75 && heightRatio <= 4.15
  ) {
    return { restType: "quarter", beats: 1, confidence: clamp(0.7 - Math.abs(widthRatio - 0.85) * 0.08, 0.56, 0.82) };
  }

  return null;
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function loadImage(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    const image = document.createElement("img");
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function luminance(r: number, g: number, b: number) {
  return Math.round(r * 0.299 + g * 0.587 + b * 0.114);
}

function otsuThreshold(histogram: Uint32Array, total: number) {
  let sum = 0;
  for (let value = 0; value < 256; value += 1) sum += value * histogram[value];
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let bestThreshold = 160;

  for (let value = 0; value < 256; value += 1) {
    backgroundWeight += histogram[value];
    if (backgroundWeight === 0) continue;
    const foregroundWeight = total - backgroundWeight;
    if (foregroundWeight === 0) break;
    backgroundSum += value * histogram[value];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * Math.pow(backgroundMean - foregroundMean, 2);
    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = value;
    }
  }
  return clamp(bestThreshold + 8, 95, 215);
}

function binarize(canvas: HTMLCanvasElement): BinaryImage {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法读取图片像素");
  const { width, height } = canvas;
  const image = context.getImageData(0, 0, width, height);
  const gray = new Uint8Array(width * height);
  const histogram = new Uint32Array(256);

  for (let pixel = 0; pixel < gray.length; pixel += 1) {
    const offset = pixel * 4;
    const value = luminance(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
    gray[pixel] = value;
    histogram[value] += 1;
  }
  const threshold = otsuThreshold(histogram, gray.length);
  const data = new Uint8Array(gray.length);
  for (let pixel = 0; pixel < gray.length; pixel += 1) data[pixel] = gray[pixel] < threshold ? 1 : 0;
  return { data, width, height, threshold };
}

function projectionScore(canvas: HTMLCanvasElement) {
  const binary = binarize(canvas);
  const rows = new Float64Array(binary.height);
  const left = Math.floor(binary.width * 0.05);
  const right = Math.ceil(binary.width * 0.95);
  for (let y = 0; y < binary.height; y += 1) {
    let count = 0;
    for (let x = left; x < right; x += 2) count += binary.data[y * binary.width + x];
    rows[y] = count;
  }
  return Array.from(rows)
    .sort((a, b) => b - a)
    .slice(0, Math.min(40, Math.ceil(binary.height * 0.08)))
    .reduce((total, row) => total + row * row, 0);
}

function estimateSkew(source: HTMLCanvasElement) {
  const scale = Math.min(1, 720 / source.width);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const sample = makeCanvas(width, height);
  const context = sample.getContext("2d");
  if (!context) return 0;

  let bestAngle = 0;
  let bestScore = -1;
  for (let angle = -4; angle <= 4; angle += 0.5) {
    context.save();
    context.fillStyle = "white";
    context.fillRect(0, 0, width, height);
    context.translate(width / 2, height / 2);
    context.rotate((angle * Math.PI) / 180);
    context.drawImage(source, -width / 2, -height / 2, width, height);
    context.restore();
    const score = projectionScore(sample);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }
  return bestAngle;
}

export function detectStaves(binary: BinaryImage): Staff[] {
  const { data, width, height } = binary;
  const leftBoundary = Math.floor(width * 0.03);
  const rightBoundary = Math.ceil(width * 0.97);
  const span = rightBoundary - leftBoundary;
  const rowCounts = new Uint32Array(height);

  for (let y = 0; y < height; y += 1) {
    let count = 0;
    const row = y * width;
    for (let x = leftBoundary; x < rightBoundary; x += 1) count += data[row + x];
    rowCounts[y] = count;
  }

  const lineRows: number[] = [];
  let start = -1;
  for (let y = 0; y <= height; y += 1) {
    const isLine = y < height && rowCounts[y] > span * 0.22;
    if (isLine && start < 0) start = y;
    if (!isLine && start >= 0) {
      let weighted = 0;
      let weight = 0;
      for (let row = start; row < y; row += 1) {
        weighted += row * rowCounts[row];
        weight += rowCounts[row];
      }
      lineRows.push(weight ? weighted / weight : (start + y - 1) / 2);
      start = -1;
    }
  }

  const staves: Staff[] = [];
  for (let index = 0; index <= lineRows.length - 5; index += 1) {
    const lines = lineRows.slice(index, index + 5);
    const gaps = lines.slice(1).map((line, gapIndex) => line - lines[gapIndex]);
    const spacing = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const deviation = Math.max(...gaps.map((gap) => Math.abs(gap - spacing)));
    if (spacing < 4 || spacing > 55 || deviation > spacing * 0.28) continue;
    if (staves.some((staff) => Math.abs(staff.lines[0] - lines[0]) < spacing * 2)) continue;

    let left = width;
    let right = 0;
    for (const line of lines) {
      const center = Math.round(line);
      for (let y = Math.max(0, center - 1); y <= Math.min(height - 1, center + 1); y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (data[y * width + x]) {
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
        }
      }
    }
    staves.push({ lines, spacing, left: Math.max(0, left), right: Math.min(width - 1, right) });
    index += 4;
  }
  return staves;
}

function removeStaffLines(binary: BinaryImage, staves: Staff[]) {
  const clean = binary.data.slice();
  const { width, height, data } = binary;
  for (const staff of staves) {
    const halfThickness = Math.max(1, Math.round(staff.spacing * 0.11));
    for (const line of staff.lines) {
      const center = Math.round(line);
      for (let y = Math.max(0, center - halfThickness); y <= Math.min(height - 1, center + halfThickness); y += 1) {
        for (let x = staff.left; x <= staff.right; x += 1) {
          if (!data[y * width + x]) continue;
          const above = Math.max(0, center - halfThickness - 2);
          const below = Math.min(height - 1, center + halfThickness + 2);
          const preservesVerticalShape = data[above * width + x] && data[below * width + x];
          if (!preservesVerticalShape) clean[y * width + x] = 0;
        }
      }
    }
  }
  return clean;
}

function integralImage(data: Uint8Array, width: number, height: number) {
  const stride = width + 1;
  const integral = new Uint32Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= width; x += 1) {
      rowSum += data[(y - 1) * width + (x - 1)];
      integral[y * stride + x] = integral[(y - 1) * stride + x] + rowSum;
    }
  }
  return integral;
}

function rectangleSum(
  integral: Uint32Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const stride = width + 1;
  const left = clamp(Math.floor(x0), 0, width);
  const top = clamp(Math.floor(y0), 0, height);
  const right = clamp(Math.ceil(x1), 0, width);
  const bottom = clamp(Math.ceil(y1), 0, height);
  return (
    integral[bottom * stride + right] -
    integral[top * stride + right] -
    integral[bottom * stride + left] +
    integral[top * stride + left]
  );
}

type GlyphComponent = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  pixels: number;
};

function connectedComponents(
  data: Uint8Array,
  width: number,
  height: number,
  bounds: { x0: number; y0: number; x1: number; y1: number },
) {
  const left = clamp(Math.floor(bounds.x0), 0, width - 1);
  const top = clamp(Math.floor(bounds.y0), 0, height - 1);
  const right = clamp(Math.ceil(bounds.x1), 0, width - 1);
  const bottom = clamp(Math.ceil(bounds.y1), 0, height - 1);
  const seen = new Uint8Array(width * height);
  const components: GlyphComponent[] = [];
  const queueX: number[] = [];
  const queueY: number[] = [];

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const start = y * width + x;
      if (!data[start] || seen[start]) continue;
      seen[start] = 1;
      queueX.length = 0;
      queueY.length = 0;
      queueX.push(x);
      queueY.push(y);
      let cursor = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let pixels = 0;
      while (cursor < queueX.length) {
        const currentX = queueX[cursor];
        const currentY = queueY[cursor];
        cursor += 1;
        pixels += 1;
        minX = Math.min(minX, currentX);
        maxX = Math.max(maxX, currentX);
        minY = Math.min(minY, currentY);
        maxY = Math.max(maxY, currentY);
        const neighbors = [
          [currentX - 1, currentY],
          [currentX + 1, currentY],
          [currentX, currentY - 1],
          [currentX, currentY + 1],
        ];
        for (const [nextX, nextY] of neighbors) {
          if (nextX < left || nextX > right || nextY < top || nextY > bottom) continue;
          const next = nextY * width + nextX;
          if (!data[next] || seen[next]) continue;
          seen[next] = 1;
          queueX.push(nextX);
          queueY.push(nextY);
        }
      }
      components.push({ x0: minX, y0: minY, x1: maxX, y1: maxY, pixels });
    }
  }
  return components;
}

function countProjectionLobes(data: Uint8Array, width: number, component: GlyphComponent) {
  const glyphWidth = Math.max(1, component.x1 - component.x0 + 1);
  let lobes = 0;
  let active = false;
  for (let y = component.y0; y <= component.y1; y += 1) {
    let rowInk = 0;
    for (let x = component.x0; x <= component.x1; x += 1) rowInk += data[y * width + x];
    const rowActive = rowInk >= Math.max(2, glyphWidth * 0.42);
    if (rowActive && !active) lobes += 1;
    active = rowActive;
  }
  return lobes;
}

function detectAugmentationDot(
  integral: Uint32Array,
  width: number,
  height: number,
  rightEdge: number,
  y: number,
  spacing: number,
) {
  const x0 = rightEdge + spacing * 0.42;
  const x1 = rightEdge + spacing * 1.45;
  const y0 = y - spacing * 0.48;
  const y1 = y + spacing * 0.48;
  const ink = rectangleSum(integral, width, height, x0, y0, x1, y1);
  const normalizedInk = ink / Math.max(1, spacing * spacing);
  return normalizedInk >= 0.035 && normalizedInk <= 0.32;
}

function longestVerticalRun(data: Uint8Array, width: number, height: number, x: number, y0: number, y1: number) {
  let longest = 0;
  let current = 0;
  let runStart = y0;
  let bestStart = y0;
  for (let y = clamp(y0, 0, height - 1); y <= clamp(y1, 0, height - 1); y += 1) {
    if (data[y * width + clamp(x, 0, width - 1)]) {
      if (current === 0) runStart = y;
      current += 1;
      if (current > longest) {
        longest = current;
        bestStart = runStart;
      }
    } else {
      current = 0;
    }
  }
  return { length: longest, start: bestStart, end: bestStart + longest };
}

function detectAccidental(
  integral: Uint32Array,
  data: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  spacing: number,
): "♯" | "♭" | "" {
  const left = Math.round(x - spacing * 2.15);
  const right = Math.round(x - spacing * 0.72);
  const top = Math.round(y - spacing * 1.35);
  const bottom = Math.round(y + spacing * 1.35);
  const ink = rectangleSum(integral, width, height, left, top, right, bottom);
  if (ink < spacing * spacing * 0.42) return "";

  const peaks: number[] = [];
  for (let column = left; column <= right; column += 1) {
    let count = 0;
    for (let row = top; row <= bottom; row += 1) {
      if (row >= 0 && row < height && column >= 0 && column < width) count += data[row * width + column];
    }
    if (count > spacing * 1.15 && (peaks.length === 0 || column - peaks[peaks.length - 1] > spacing * 0.28)) {
      peaks.push(column);
    }
  }
  if (peaks.length >= 2) return "♯";
  if (peaks.length === 1) return "♭";
  return "";
}

function detectFlagCount(
  integral: Uint32Array,
  width: number,
  height: number,
  candidate: NoteCandidate,
  spacing: number,
) {
  const direction = candidate.stemUp ? 1 : -1;
  const left = candidate.stemX - spacing * 0.3;
  const right = candidate.stemX + spacing * 1.4;
  const bandInk = (offset: number) =>
    rectangleSum(
      integral,
      width,
      height,
      left,
      candidate.stemTop + direction * spacing * (offset - 0.22),
      right,
      candidate.stemTop + direction * spacing * (offset + 0.22),
    ) / Math.max(1, spacing * spacing);
  const first = bandInk(0.38);
  const second = bandInk(0.92);
  if (first > 0.24 && second > 0.18) return 2;
  if (first > 0.2) return 1;
  return 0;
}

function detectBeamCount(
  integral: Uint32Array,
  width: number,
  height: number,
  first: NoteCandidate,
  second: NoteCandidate,
  spacing: number,
) {
  if (first.stemUp !== second.stemUp) return 0;
  const left = Math.min(first.stemX, second.stemX);
  const right = Math.max(first.stemX, second.stemX);
  if (right - left < spacing * 0.65) return 0;
  const direction = first.stemUp ? 1 : -1;
  const endpointMin = Math.min(first.stemTop, second.stemTop);
  const endpointMax = Math.max(first.stemTop, second.stemTop);
  const stripRatio = (offset: number) => {
    const top = endpointMin + direction * spacing * offset - spacing * 0.2;
    const bottom = endpointMax + direction * spacing * offset + spacing * 0.2;
    const ink = rectangleSum(integral, width, height, left, top, right, bottom);
    const area = Math.max(1, (right - left) * Math.max(spacing * 0.4, bottom - top));
    return ink / area;
  };
  if (stripRatio(0) < 0.25) return 0;
  return stripRatio(0.62) > 0.24 ? 2 : 1;
}

export function pitchFromStaffStep(step: number, accidental: "♯" | "♭" | "") {
  const letters = ["C", "D", "E", "F", "G", "A", "B"];
  const absoluteDiatonic = 4 * 7 + 2 + step;
  const octave = Math.floor(absoluteDiatonic / 7);
  const letter = letters[((absoluteDiatonic % 7) + 7) % 7];
  return `${letter}${accidental}${octave}`;
}

function detectNoteCandidates(binary: BinaryImage, clean: Uint8Array, staves: Staff[]) {
  const { width, height, data } = binary;
  const cleanIntegral = integralImage(clean, width, height);
  const rawIntegral = integralImage(data, width, height);
  const candidates: NoteCandidate[] = [];

  staves.forEach((staff, staffIndex) => {
    const spacing = staff.spacing;
    const rx = Math.max(3, spacing * 0.72);
    const ry = Math.max(2, spacing * 0.48);
    const startX = Math.max(staff.left + spacing * 6.2, width * 0.07);
    const endX = Math.min(staff.right - spacing, width * 0.98);
    const scanStep = Math.max(1, Math.round(spacing * 0.18));

    for (let step = -7; step <= 17; step += 1) {
      const y = staff.lines[4] - (step * spacing) / 2;
      if (y < 2 || y >= height - 2) continue;
      const scores: Array<{ x: number; score: number }> = [];
      for (let x = startX; x <= endX; x += scanStep) {
        const ink = rectangleSum(cleanIntegral, width, height, x - rx, y - ry, x + rx, y + ry);
        const area = Math.max(1, Math.round(rx * 2) * Math.round(ry * 2));
        const score = ink / area;
        scores.push({ x, score });
      }

      for (let index = 1; index < scores.length - 1; index += 1) {
        const current = scores[index];
        if (current.score < 0.13 || current.score < scores[index - 1].score || current.score < scores[index + 1].score) continue;
        const horizontalInk = rectangleSum(
          cleanIntegral,
          width,
          height,
          current.x - spacing * 0.72,
          y - spacing * 0.26,
          current.x + spacing * 0.72,
          y + spacing * 0.26,
        );
        if (horizontalInk < spacing * 0.55) continue;

        const innerInk = rectangleSum(
          rawIntegral,
          width,
          height,
          current.x - spacing * 0.32,
          y - spacing * 0.22,
          current.x + spacing * 0.32,
          y + spacing * 0.22,
        );
        const innerArea = Math.max(1, spacing * 0.64 * spacing * 0.44);
        const filled = innerInk / innerArea > 0.48;
        const leftStem = longestVerticalRun(clean, width, height, Math.round(current.x - rx), Math.round(y - spacing * 3.2), Math.round(y + spacing * 3.2));
        const rightStem = longestVerticalRun(clean, width, height, Math.round(current.x + rx), Math.round(y - spacing * 3.2), Math.round(y + spacing * 3.2));
        const stem = rightStem.length >= leftStem.length ? rightStem : leftStem;
        const stemUp = rightStem.length >= leftStem.length;
        const hasStem = stem.length > spacing * 1.65;
        const beats = filled ? 1 : hasStem ? 2 : 4;
        const accidental = detectAccidental(rawIntegral, data, width, height, current.x, y, spacing);
        candidates.push({
          kind: "note",
          staffIndex,
          x: current.x,
          y,
          step,
          score: current.score,
          filled,
          stemUp,
          stemTop: stemUp ? stem.start : stem.end,
          beats,
          accidental,
          dotted: false,
          subdivisionCount: 0,
          stemX: current.x + (stemUp ? rx : -rx),
        });
      }
    }
  });

  candidates.sort((a, b) => b.score - a.score);
  const kept: NoteCandidate[] = [];
  for (const candidate of candidates) {
    const spacing = staves[candidate.staffIndex].spacing;
    const duplicate = kept.some(
      (existing) =>
        existing.staffIndex === candidate.staffIndex &&
        Math.abs(existing.x - candidate.x) < spacing * 1.15 &&
        Math.abs(existing.y - candidate.y) < spacing * 0.9,
    );
    if (!duplicate) kept.push(candidate);
  }
  kept.sort((a, b) => a.staffIndex - b.staffIndex || a.x - b.x);

  kept.forEach((candidate) => {
    if (!candidate.filled) return;
    const spacing = staves[candidate.staffIndex].spacing;
    candidate.subdivisionCount = detectFlagCount(rawIntegral, width, height, candidate, spacing);
  });

  for (let index = 0; index < kept.length - 1; index += 1) {
    const first = kept[index];
    const second = kept[index + 1];
    if (!first.filled || !second.filled || first.staffIndex !== second.staffIndex) continue;
    const spacing = staves[first.staffIndex].spacing;
    if (second.x - first.x > spacing * 5.2) continue;
    const beamCount = detectBeamCount(rawIntegral, width, height, first, second, spacing);
    first.subdivisionCount = Math.max(first.subdivisionCount, beamCount);
    second.subdivisionCount = Math.max(second.subdivisionCount, beamCount);
  }

  kept.forEach((candidate) => {
    const spacing = staves[candidate.staffIndex].spacing;
    candidate.dotted = detectAugmentationDot(
      cleanIntegral,
      width,
      height,
      candidate.x + spacing * 0.72,
      candidate.y,
      spacing,
    );
    candidate.beats = applyRhythmMarks(candidate.beats, candidate.subdivisionCount, candidate.dotted);
  });
  return kept;
}

function detectRestCandidates(
  binary: BinaryImage,
  clean: Uint8Array,
  staves: Staff[],
  notes: NoteCandidate[],
) {
  const { width, height } = binary;
  const cleanIntegral = integralImage(clean, width, height);
  const candidates: RestCandidate[] = [];

  staves.forEach((staff, staffIndex) => {
    const spacing = staff.spacing;
    const startX = Math.max(staff.left + spacing * 6.2, width * 0.07);
    const endX = Math.min(staff.right - spacing, width * 0.98);
    const components = connectedComponents(clean, width, height, {
      x0: startX,
      y0: staff.lines[0] - spacing * 2.1,
      x1: endX,
      y1: staff.lines[4] + spacing * 2.1,
    });

    for (const component of components) {
      const glyphWidth = component.x1 - component.x0 + 1;
      const glyphHeight = component.y1 - component.y0 + 1;
      const widthRatio = glyphWidth / spacing;
      const heightRatio = glyphHeight / spacing;
      const x = (component.x0 + component.x1) / 2;
      const y = (component.y0 + component.y1) / 2;
      const normalizedPixels = component.pixels / Math.max(1, spacing * spacing);
      if (normalizedPixels < 0.055 || normalizedPixels > 4.8) continue;
      if (heightRatio > 4.3 || widthRatio < 0.18 || widthRatio > 2.25) continue;

      const overlapsNote = notes.some(
        (note) =>
          note.staffIndex === staffIndex &&
          Math.abs(note.x - x) < spacing * 2.05 &&
          Math.abs(note.y - y) < spacing * 3.65,
      );
      if (overlapsNote) continue;

      const area = Math.max(1, glyphWidth * glyphHeight);
      const classification = classifyRestGlyph({
        widthRatio,
        heightRatio,
        centerOffset: (y - staff.lines[2]) / spacing,
        density: component.pixels / area,
        lobeCount: countProjectionLobes(clean, width, component),
      });
      if (!classification) continue;

      const dotted = detectAugmentationDot(cleanIntegral, width, height, component.x1, y, spacing);
      candidates.push({
        kind: "rest",
        staffIndex,
        x,
        y,
        x0: component.x0,
        y0: component.y0,
        x1: component.x1,
        y1: component.y1,
        score: classification.confidence,
        beats: classification.beats * (dotted ? 1.5 : 1),
        dotted,
        restType: classification.restType,
      });
    }
  });

  candidates.sort((a, b) => b.score - a.score);
  const kept: RestCandidate[] = [];
  for (const candidate of candidates) {
    const spacing = staves[candidate.staffIndex].spacing;
    const duplicate = kept.some(
      (existing) =>
        existing.staffIndex === candidate.staffIndex &&
        Math.abs(existing.x - candidate.x) < spacing * 1.35,
    );
    if (!duplicate) kept.push(candidate);
  }
  return kept.sort((a, b) => a.staffIndex - b.staffIndex || a.x - b.x);
}

function annotatePreview(canvas: HTMLCanvasElement, staves: Staff[], candidates: Candidate[], notes: LessonNote[]) {
  const context = canvas.getContext("2d");
  if (!context) return canvas.toDataURL("image/jpeg", 0.88);
  context.save();
  context.lineWidth = Math.max(2, canvas.width / 700);
  context.font = `700 ${Math.max(13, canvas.width / 70)}px Arial, sans-serif`;
  context.textBaseline = "bottom";

  for (const staff of staves) {
    context.strokeStyle = "rgba(38, 132, 108, .72)";
    context.setLineDash([8, 6]);
    for (const line of staff.lines) {
      context.beginPath();
      context.moveTo(staff.left, line);
      context.lineTo(staff.right, line);
      context.stroke();
    }
  }
  context.setLineDash([]);
  candidates.forEach((candidate, index) => {
    const spacing = staves[candidate.staffIndex].spacing;
    const isRest = candidate.kind === "rest";
    context.strokeStyle = isRest ? "#337f9e" : "#e9684a";
    context.fillStyle = isRest ? "#337f9e" : "#e9684a";
    if (isRest) {
      context.strokeRect(
        candidate.x0 - spacing * 0.28,
        candidate.y0 - spacing * 0.28,
        candidate.x1 - candidate.x0 + spacing * 0.56,
        candidate.y1 - candidate.y0 + spacing * 0.56,
      );
    } else {
      context.strokeRect(candidate.x - spacing, candidate.y - spacing * 0.72, spacing * 2, spacing * 1.44);
    }
    const label = notes[index]?.kind === "rest" ? "休" : notes[index]?.written ?? "?";
    context.fillText(label, candidate.x - spacing, candidate.y - spacing * 0.88);
  });
  context.restore();
  return canvas.toDataURL("image/jpeg", 0.9);
}

export async function recognizeScoreImage(file: File): Promise<RecognitionResult> {
  const source = await loadImage(file);
  const maxWidth = 1500;
  const scale = Math.min(1, maxWidth / source.width);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const raw = makeCanvas(width, height);
  const rawContext = raw.getContext("2d");
  if (!rawContext) throw new Error("浏览器无法建立图像画布");
  rawContext.fillStyle = "white";
  rawContext.fillRect(0, 0, width, height);
  rawContext.drawImage(source, 0, 0, width, height);

  const deskewDegrees = estimateSkew(raw);
  const corrected = makeCanvas(width, height);
  const context = corrected.getContext("2d");
  if (!context) throw new Error("浏览器无法校正谱面");
  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);
  context.translate(width / 2, height / 2);
  context.rotate((deskewDegrees * Math.PI) / 180);
  context.drawImage(raw, -width / 2, -height / 2);
  context.setTransform(1, 0, 0, 1, 0, 0);

  const binary = binarize(corrected);
  const staves = detectStaves(binary);
  if (staves.length === 0) {
    throw new Error("没有找到连续的五条谱线，请裁掉多余背景并保持照片水平后重试");
  }
  const clean = removeStaffLines(binary, staves);
  const noteCandidates = detectNoteCandidates(binary, clean, staves);
  const restCandidates = detectRestCandidates(binary, clean, staves, noteCandidates);
  const candidates: Candidate[] = [...noteCandidates, ...restCandidates]
    .sort((a, b) => a.staffIndex - b.staffIndex || a.x - b.x)
    .slice(0, 64);
  if (candidates.length === 0) {
    throw new Error("已找到五线谱，但没有可靠识别到音符或休止符，请换一张更清晰、对比度更高的照片");
  }

  const notes = candidates.map((candidate, index) => {
    if (candidate.kind === "rest") {
      return buildRestEvent(candidate.beats, {
        id: `recognized-${index}-rest`,
        confidence: clamp(candidate.score, 0.46, 0.94),
        source: "recognized",
        restType: candidate.restType,
      });
    }
    const written = pitchFromStaffStep(candidate.step, candidate.accidental);
    const confidence = clamp(0.42 + candidate.score * 1.25, 0.46, 0.98);
    return buildLessonNote(written, candidate.beats, {
      id: `recognized-${index}-${written}`,
      confidence,
      source: "recognized",
    });
  });
  const confidence = notes.reduce((sum, note) => sum + note.confidence, 0) / notes.length;
  const restCount = candidates.filter((candidate) => candidate.kind === "rest").length;
  const dottedCount = candidates.filter((candidate) => candidate.dotted).length;
  const subdivisionCount = candidates.filter(
    (candidate) => candidate.kind === "note" && candidate.subdivisionCount > 0,
  ).length;
  const warning =
    notes.some((note) => note.confidence < 0.66)
      ? "部分节奏符号置信度较低，请在下方逐项校对后再开始课堂练习。"
      : "识别结果仍建议由老师快速核对，尤其是附点、连梁分组与休止符。";

  return {
    notes,
    staffCount: staves.length,
    confidence,
    deskewDegrees,
    previewDataUrl: annotatePreview(corrected, staves, candidates, notes),
    warning,
    restCount,
    dottedCount,
    subdivisionCount,
  };
}
