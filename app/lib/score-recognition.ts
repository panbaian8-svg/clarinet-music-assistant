import {
  buildLessonNote,
  buildRestEvent,
  type LessonNote,
  type NoteArticulation,
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
  meterBeats: number;
  slurNoteCount: number;
  slurGroupCount: number;
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
  dotX: number | null;
  subdivisionCount: number;
  stemX: number;
  rhythmEvidence: {
    primarySpan: number;
    primaryCoverage: number;
    secondarySpan: number;
    secondaryCoverage: number;
  };
  beamToPrevious: boolean;
  beamToNext: boolean;
  articulation: NoteArticulation;
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

export type BinaryImage = {
  data: Uint8Array;
  width: number;
  height: number;
  threshold: number;
};

export type BinaryScoreEvent = {
  kind: "note" | "rest";
  written: string;
  beats: number;
  rhythmMark: "plain" | "dotted";
  staffIndex: number;
  x: number;
  y: number;
  confidence: number;
  subdivisionCount: number;
  measureIndex: number;
  articulation: NoteArticulation | "silent";
  restType: RestType | null;
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
    centerOffset >= -1.45 && centerOffset <= 1.55 &&
    lobeCount >= 3
  ) {
    return { restType: "sixteenth", beats: 0.25, confidence: clamp(0.58 + lobeCount * 0.05, 0.62, 0.86) };
  }

  if (
    widthRatio >= 0.4 && widthRatio <= 1.85 &&
    heightRatio >= 1.05 && heightRatio <= 2.55 &&
    centerOffset >= -1.45 && centerOffset <= 1.55 &&
    lobeCount <= 2
  ) {
    return { restType: "eighth", beats: 0.5, confidence: clamp(0.74 - Math.abs(heightRatio - 1.75) * 0.08, 0.6, 0.86) };
  }

  if (
    widthRatio >= 0.34 && widthRatio <= 1.55 &&
    heightRatio >= 1.75 && heightRatio <= 4.15 &&
    centerOffset >= -1.45 && centerOffset <= 1.55
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

export function binarizeRgbaPixels(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  channels = 4,
): BinaryImage {
  const gray = new Uint8Array(width * height);
  const histogram = new Uint32Array(256);

  for (let pixel = 0; pixel < gray.length; pixel += 1) {
    const offset = pixel * channels;
    const value = luminance(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
    gray[pixel] = value;
    histogram[value] += 1;
  }
  const threshold = otsuThreshold(histogram, gray.length);
  const data = new Uint8Array(gray.length);
  for (let pixel = 0; pixel < gray.length; pixel += 1) data[pixel] = gray[pixel] < threshold ? 1 : 0;
  return { data, width, height, threshold };
}

function binarize(canvas: HTMLCanvasElement): BinaryImage {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法读取图片像素");
  const { width, height } = canvas;
  const image = context.getImageData(0, 0, width, height);
  return binarizeRgbaPixels(image.data, width, height);
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
  includeDiagonals = false,
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
        if (includeDiagonals) {
          neighbors.push(
            [currentX - 1, currentY - 1],
            [currentX + 1, currentY - 1],
            [currentX - 1, currentY + 1],
            [currentX + 1, currentY + 1],
          );
        }
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
  data: Uint8Array,
  width: number,
  height: number,
  rightEdge: number,
  y: number,
  spacing: number,
) {
  const x0 = rightEdge + spacing * 0.4;
  const x1 = rightEdge + spacing * 1.23;
  const y0 = y - spacing * 1.2;
  const y1 = y + spacing * 1.2;
  const components = connectedComponents(data, width, height, { x0, y0, x1, y1 });
  const component = components.find((component) => {
    const componentWidth = component.x1 - component.x0 + 1;
    const componentHeight = component.y1 - component.y0 + 1;
    const centerY = (component.y0 + component.y1) / 2;
    const aspectRatio = componentWidth / Math.max(1, componentHeight);
    const density = component.pixels / Math.max(1, componentWidth * componentHeight);
    return (
      componentWidth >= spacing * 0.14 &&
      componentWidth <= spacing * 0.7 &&
      componentHeight >= spacing * 0.14 &&
      componentHeight <= spacing * 0.7 &&
      component.pixels >= spacing * spacing * 0.025 &&
      component.pixels <= spacing * spacing * 0.38 &&
      aspectRatio >= 0.62 && aspectRatio <= 1.5 &&
      density >= 0.48 &&
      Math.abs(centerY - y) <= spacing * 1.1
    );
  });
  return component ? (component.x0 + component.x1) / 2 : null;
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

export function detectBarlines(binary: BinaryImage, staves = detectStaves(binary)) {
  return staves.map((staff, staffIndex) => {
    const spacing = staff.spacing;
    const startX = staff.left + (staffIndex === 0 ? spacing * 6.2 : spacing * 4.05);
    const endX = staff.right - spacing * 0.4;
    const activeColumns: number[] = [];
    for (let x = Math.round(startX); x <= Math.round(endX); x += 1) {
      const topLine = Math.round(staff.lines[0]);
      const bottomLine = Math.round(staff.lines[4]);
      const run = longestVerticalRun(
        binary.data,
        binary.width,
        binary.height,
        x,
        Math.round(topLine - spacing * 0.28),
        Math.round(bottomLine + spacing * 0.28),
      );
      const crossesTop = run.start <= topLine + spacing * 0.32;
      const crossesBottom = run.end >= bottomLine - spacing * 0.32;
      if (run.length >= spacing * 3.7 && crossesTop && crossesBottom) activeColumns.push(x);
    }
    const groups: number[][] = [];
    for (const x of activeColumns) {
      const group = groups.at(-1);
      if (!group || x - group.at(-1)! > Math.max(2, spacing * 0.3)) groups.push([x]);
      else group.push(x);
    }
    return groups
      .filter((group) => group.length <= spacing * 1.6)
      .map((group) => group.reduce((sum, x) => sum + x, 0) / group.length);
  });
}

function longestBoundedHorizontalRun(
  data: Uint8Array,
  width: number,
  height: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  maximumRun: number,
) {
  let longest = 0;
  for (let y = clamp(Math.round(y0), 0, height - 1); y <= clamp(Math.round(y1), 0, height - 1); y += 1) {
    let current = 0;
    const record = () => {
      if (current <= maximumRun) longest = Math.max(longest, current);
      current = 0;
    };
    for (let x = clamp(Math.round(x0), 0, width - 1); x <= clamp(Math.round(x1), 0, width - 1); x += 1) {
      if (data[y * width + x]) {
        current += 1;
      } else {
        record();
      }
    }
    record();
  }
  return longest;
}

function horizontalRunCoverage(
  data: Uint8Array,
  width: number,
  height: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  minimumRun: number,
  maximumRun = Number.POSITIVE_INFINITY,
) {
  let coveredRows = 0;
  for (let y = clamp(Math.round(y0), 0, height - 1); y <= clamp(Math.round(y1), 0, height - 1); y += 1) {
    let longest = 0;
    let current = 0;
    for (let x = clamp(Math.round(x0), 0, width - 1); x <= clamp(Math.round(x1), 0, width - 1); x += 1) {
      if (data[y * width + x]) {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    }
    if (longest >= minimumRun && longest <= maximumRun) coveredRows += 1;
  }
  return coveredRows;
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
  const left = Math.round(x - spacing * 1.58);
  const right = Math.round(x - spacing * 0.76);
  const top = Math.round(y - spacing * 1.35);
  const bottom = Math.round(y + spacing * 1.35);
  const ink = rectangleSum(integral, width, height, left, top, right, bottom);
  if (ink < spacing * spacing * 0.32 || ink > spacing * spacing * 1.55) return "";

  const peaks: number[] = [];
  for (let column = left; column <= right; column += 1) {
    let count = 0;
    for (let row = top; row <= bottom; row += 1) {
      if (row >= 0 && row < height && column >= 0 && column < width) count += data[row * width + column];
    }
    if (count > spacing * 1.32 && (peaks.length === 0 || column - peaks[peaks.length - 1] > spacing * 0.24)) {
      peaks.push(column);
    }
  }
  if (peaks.length === 2 && peaks[1] - peaks[0] <= spacing * 0.62) return "♯";
  if (peaks.length === 1) {
    const lowerLobe = rectangleSum(
      integral,
      width,
      height,
      peaks[0] + spacing * 0.08,
      y - spacing * 0.05,
      right,
      y + spacing * 1.05,
    );
    if (lowerLobe > spacing * spacing * 0.17) return "♭";
  }
  return "";
}

function horizontalAttachmentSpan(
  data: Uint8Array,
  width: number,
  height: number,
  stemX: number,
  centerY: number,
  spacing: number,
) {
  const bandHalfHeight = Math.max(2, Math.round(spacing * 0.32));
  const minimumColumnInk = Math.max(3, Math.round(spacing * 0.22));
  const innerGap = Math.max(1, Math.round(spacing * 0.16));
  const reach = Math.max(3, Math.round(spacing * 2.35));
  const allowedGap = Math.max(1, Math.round(spacing * 0.16));
  let bestSpan = 0;
  let bestCoverage = 0;

  for (const direction of [-1, 1]) {
    let attachedSpan = 0;
    let covered = 0;
    let sampled = 0;
    let gap = 0;
    for (let distance = innerGap; distance <= reach; distance += 1) {
      const x = Math.round(stemX + direction * distance);
      if (x < 0 || x >= width) continue;
      let columnInk = 0;
      for (let dy = -bandHalfHeight; dy <= bandHalfHeight; dy += 1) {
        const y = Math.round(centerY + dy);
        if (y < 0 || y >= height) continue;
        columnInk += data[y * width + x];
      }
      sampled += 1;
      if (columnInk >= minimumColumnInk) {
        covered += 1;
        gap = 0;
        attachedSpan = distance - innerGap + 1;
      } else {
        gap += 1;
        if (gap > allowedGap) break;
      }
    }
    bestSpan = Math.max(bestSpan, attachedSpan / spacing);
    bestCoverage = Math.max(bestCoverage, covered / Math.max(1, sampled));
  }
  return { span: bestSpan, coverage: bestCoverage };
}

function detectStemSubdivisionCount(
  data: Uint8Array,
  width: number,
  height: number,
  candidate: NoteCandidate,
  spacing: number,
) {
  const towardHead = candidate.stemUp ? 1 : -1;
  const maximumOffset = Math.max(3, Math.round(spacing * 1.9));
  const allowedGap = Math.max(1, Math.round(spacing * 0.1));
  const minimumBandHeight = Math.max(2, Math.round(spacing * 0.13));
  const bands: Array<{ rows: number; span: number; coverage: number }> = [];
  let activeBand: { rows: number; span: number; coverage: number } | null = null;
  let gap = 0;

  for (let offset = 0; offset <= maximumOffset; offset += 1) {
    const stats = horizontalAttachmentSpan(
      data,
      width,
      height,
      candidate.stemX,
      candidate.stemTop + towardHead * offset,
      spacing,
    );
    const active = stats.span >= 0.44 && stats.coverage >= 0.18;
    if (active) {
      if (!activeBand) activeBand = { rows: 0, span: 0, coverage: 0 };
      activeBand.rows += 1;
      activeBand.span = Math.max(activeBand.span, stats.span);
      activeBand.coverage = Math.max(activeBand.coverage, stats.coverage);
      gap = 0;
      continue;
    }
    if (!activeBand) continue;
    gap += 1;
    if (gap <= allowedGap) continue;
    if (activeBand.rows >= minimumBandHeight) bands.push(activeBand);
    activeBand = null;
    gap = 0;
  }
  if (activeBand && activeBand.rows >= minimumBandHeight) bands.push(activeBand);
  const primary = bands[0] ?? { span: 0, coverage: 0 };
  const secondary = bands[1] ?? { span: 0, coverage: 0 };
  return {
    count: Math.min(2, bands.length),
    primarySpan: primary.span,
    primaryCoverage: primary.coverage,
    secondarySpan: secondary.span,
    secondaryCoverage: secondary.coverage,
  };
}

function detectBeamCount(
  data: Uint8Array,
  width: number,
  height: number,
  first: NoteCandidate,
  second: NoteCandidate,
  spacing: number,
) {
  const firstIsLeft = first.x <= second.x;
  const leftNote = firstIsLeft ? first : second;
  const rightNote = firstIsLeft ? second : first;
  const left = leftNote.x;
  const right = rightNote.x;
  if (right - left < spacing * 0.65) return 0;
  const inset = Math.max(1, Math.round(spacing * 0.48));
  const halfBand = Math.max(1, Math.round(spacing * 0.17));
  const stripStats = (leftY: number, rightY: number) => {
    let ink = 0;
    let samples = 0;
    let coveredColumns = 0;
    let columns = 0;
    const start = clamp(Math.round(left) + inset, 0, width - 1);
    const end = clamp(Math.round(right) - inset, 0, width - 1);
    for (let x = start; x <= end; x += 1) {
      const progress = (x - left) / Math.max(1, right - left);
      const centerY = leftY + (rightY - leftY) * progress;
      let columnInk = 0;
      for (let dy = -halfBand; dy <= halfBand; dy += 1) {
        const y = Math.round(centerY + dy);
        if (y < 0 || y >= height) continue;
        columnInk += data[y * width + x];
        samples += 1;
      }
      ink += columnInk;
      coveredColumns += Number(columnInk > 0);
      columns += 1;
    }
    return {
      ratio: ink / Math.max(1, samples),
      coverage: coveredColumns / Math.max(1, columns),
    };
  };
  let bestRatio = 0;
  let bestCoverage = 0;
  let bestDirection = 0;
  let bestLeftY = 0;
  let bestRightY = 0;
  const attachedStats = stripStats(leftNote.stemTop, rightNote.stemTop);
  if (attachedStats.ratio >= 0.42 && attachedStats.coverage >= 0.72) {
    bestRatio = attachedStats.ratio;
    bestCoverage = attachedStats.coverage;
    bestDirection = Math.sign(
      (leftNote.stemTop + rightNote.stemTop - leftNote.y - rightNote.y) / 2,
    ) || 1;
    bestLeftY = leftNote.stemTop;
    bestRightY = rightNote.stemTop;
  } else {
    for (const direction of [-1, 1]) {
      for (let offset = 1.45; offset <= 3.95; offset += 0.22) {
        for (let tilt = -0.7; tilt <= 0.7; tilt += 0.2) {
          const leftY = leftNote.y + direction * spacing * offset;
          const rightY = rightNote.y + direction * spacing * (offset + tilt);
          const stats = stripStats(leftY, rightY);
          const quality = stats.ratio * Math.min(1, stats.coverage / 0.82);
          const bestQuality = bestRatio * Math.min(1, bestCoverage / 0.82);
          if (quality > bestQuality) {
            bestRatio = stats.ratio;
            bestCoverage = stats.coverage;
            bestDirection = direction;
            bestLeftY = leftY;
            bestRightY = rightY;
          }
        }
      }
    }
  }
  if (bestRatio < 0.48 || bestCoverage < 0.76) return 0;
  let secondaryRatio = 0;
  let secondaryCoverage = 0;
  for (let separation = 0.48; separation <= 0.8; separation += 0.08) {
    const secondaryOffset = bestDirection * spacing * separation;
    const stats = stripStats(bestLeftY - secondaryOffset, bestRightY - secondaryOffset);
    if (stats.ratio * stats.coverage > secondaryRatio * secondaryCoverage) {
      secondaryRatio = stats.ratio;
      secondaryCoverage = stats.coverage;
    }
  }
  return secondaryRatio > 0.5 && secondaryCoverage > 0.74 ? 2 : 1;
}

export function pitchFromStaffStep(step: number, accidental: "♯" | "♭" | "") {
  const letters = ["C", "D", "E", "F", "G", "A", "B"];
  const absoluteDiatonic = 4 * 7 + 2 + step;
  const octave = Math.floor(absoluteDiatonic / 7);
  const letter = letters[((absoluteDiatonic % 7) + 7) % 7];
  return `${letter}${accidental}${octave}`;
}

function refineNoteHeadPosition(
  raw: Uint8Array,
  clean: Uint8Array,
  width: number,
  height: number,
  candidate: NoteCandidate,
  staff: Staff,
) {
  const spacing = staff.spacing;
  const left = clamp(Math.round(candidate.x - spacing * 0.78), 0, width - 1);
  const right = clamp(Math.round(candidate.x + spacing * 0.78), 0, width - 1);
  const top = clamp(Math.round(candidate.y - spacing * 0.95), 0, height - 1);
  const bottom = clamp(Math.round(candidate.y + spacing * 0.95), 0, height - 1);
  let weightedY = 0;
  let totalWeight = 0;

  for (let y = top; y <= bottom; y += 1) {
    let rowInk = 0;
    let longestRun = 0;
    let currentRun = 0;
    for (let x = left; x <= right; x += 1) {
      if (clean[y * width + x]) {
        rowInk += 1;
        currentRun += 1;
        longestRun = Math.max(longestRun, currentRun);
      } else {
        currentRun = 0;
      }
    }
    if (longestRun > spacing * 1.72) continue;
    const weight = Math.max(0, rowInk - spacing * 0.12);
    weightedY += y * weight;
    totalWeight += weight;
  }
  if (totalWeight < spacing * 0.7) return;

  const centroidY = weightedY / totalWeight;
  const refinedStep = Math.round(((staff.lines[4] - centroidY) * 2) / spacing);
  if (Math.abs(refinedStep - candidate.step) > 1) return;
  if (refinedStep === candidate.step) return;
  const refinedY = staff.lines[4] - (refinedStep * spacing) / 2;
  const xRadius = Math.max(2, Math.round(spacing * 0.3));
  const yRadius = Math.max(1, Math.round(spacing * 0.2));
  let coreInk = 0;
  let coreArea = 0;
  for (let y = Math.round(refinedY) - yRadius; y <= Math.round(refinedY) + yRadius; y += 1) {
    for (let x = Math.round(candidate.x) - xRadius; x <= Math.round(candidate.x) + xRadius; x += 1) {
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      coreArea += 1;
      coreInk += raw[y * width + x];
    }
  }
  const coreDensity = coreInk / Math.max(1, coreArea);
  let currentCoreInk = 0;
  let currentCoreArea = 0;
  for (let y = Math.round(candidate.y) - yRadius; y <= Math.round(candidate.y) + yRadius; y += 1) {
    for (let x = Math.round(candidate.x) - xRadius; x <= Math.round(candidate.x) + xRadius; x += 1) {
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      currentCoreArea += 1;
      currentCoreInk += raw[y * width + x];
    }
  }
  const currentCoreDensity = currentCoreInk / Math.max(1, currentCoreArea);
  if (candidate.filled || coreDensity < 0.7 || coreDensity - currentCoreDensity < 0.2) return;
  const hasStem = Math.abs(candidate.stemTop - refinedY) > spacing * 1.05;
  candidate.step = refinedStep;
  candidate.y = refinedY;
  candidate.filled = coreDensity >= 0.7;
  candidate.beats = candidate.filled ? 1 : hasStem ? 2 : 4;
}

function detectNoteCandidates(binary: BinaryImage, clean: Uint8Array, staves: Staff[]) {
  const { width, height, data } = binary;
  const cleanIntegral = integralImage(clean, width, height);
  const rawIntegral = integralImage(data, width, height);
  const candidates: NoteCandidate[] = [];

  staves.forEach((staff, staffIndex) => {
    const spacing = staff.spacing;
    const rx = Math.max(3, spacing * 0.64);
    const ry = Math.max(2, spacing * 0.42);
    const clefAndMeterWidth = staffIndex === 0 ? spacing * 6.2 : spacing * 4.05;
    const startX = Math.max(staff.left + clefAndMeterWidth, width * 0.045);
    const endX = Math.min(staff.right - spacing, width * 0.98);
    const scanStep = Math.max(1, Math.round(spacing * 0.12));

    for (let step = -1; step <= 12; step += 1) {
      const y = staff.lines[4] - (step * spacing) / 2;
      if (y < 2 || y >= height - 2) continue;
      const scores: Array<{ x: number; score: number }> = [];
      for (let x = startX; x <= endX; x += scanStep) {
        const ink = rectangleSum(cleanIntegral, width, height, x - rx, y - ry, x + rx, y + ry);
        const area = Math.max(1, Math.round(rx * 2) * Math.round(ry * 2));
        scores.push({ x, score: ink / area });
      }

      for (let index = 1; index < scores.length - 1; index += 1) {
        const current = scores[index];
        if (current.score < 0.17 || current.score < scores[index - 1].score || current.score < scores[index + 1].score) continue;
        let candidateX = current.x;
        let bestCenterInk = -1;
        for (let probeX = Math.round(current.x - spacing * 0.55); probeX <= Math.round(current.x + spacing * 0.55); probeX += 1) {
          const centerInk =
            rectangleSum(
              cleanIntegral,
              width,
              height,
              probeX - spacing * 0.48,
              y - spacing * 0.38,
              probeX + spacing * 0.48,
              y + spacing * 0.38,
            ) +
            rectangleSum(
              rawIntegral,
              width,
              height,
              probeX - spacing * 0.26,
              y - spacing * 0.2,
              probeX + spacing * 0.26,
              y + spacing * 0.2,
            ) * 0.35;
          if (centerInk > bestCenterInk) {
            bestCenterInk = centerInk;
            candidateX = probeX;
          }
        }
        const horizontalInk = rectangleSum(
          cleanIntegral,
          width,
          height,
          candidateX - spacing * 0.72,
          y - spacing * 0.26,
          candidateX + spacing * 0.72,
          y + spacing * 0.26,
        );
        if (horizontalInk < spacing * 0.6) continue;
        const headRun = longestBoundedHorizontalRun(
          clean,
          width,
          height,
          candidateX - spacing * 1.35,
          candidateX + spacing * 1.35,
          y - spacing * 0.28,
          y + spacing * 0.28,
          spacing * 1.7,
        );
        if (headRun < spacing * 0.48 || headRun > spacing * 1.62) continue;
        const headCoverage = horizontalRunCoverage(
          clean,
          width,
          height,
          candidateX - spacing,
          candidateX + spacing,
          y - spacing * 0.5,
          y + spacing * 0.5,
          spacing * 0.38,
          spacing * 1.8,
        );
        if (headCoverage < spacing * 0.42) continue;

        const innerInk = rectangleSum(
          rawIntegral,
          width,
          height,
          candidateX - spacing * 0.32,
          y - spacing * 0.22,
          candidateX + spacing * 0.32,
          y + spacing * 0.22,
        );
        const innerArea = Math.max(1, spacing * 0.64 * spacing * 0.44);
        const innerRatio = innerInk / innerArea;
        const coreInk = rectangleSum(
          rawIntegral,
          width,
          height,
          candidateX - spacing * 0.18,
          y - spacing * 0.14,
          candidateX + spacing * 0.18,
          y + spacing * 0.14,
        );
        const coreArea = Math.max(1, spacing * 0.36 * spacing * 0.28);
        const coreRatio = coreInk / coreArea;
        const filled = innerRatio > 0.88 && coreRatio > 1.12;
        const stemProbeOffsets = [0.46, 0.58, 0.7, 0.82, 0.94, 1.06, 1.18];
        const leftStemProbe = stemProbeOffsets
          .map((offset) => ({
            offset,
            run: longestVerticalRun(clean, width, height, Math.round(candidateX - spacing * offset), Math.round(y - spacing * 3.2), Math.round(y + spacing * 3.2)),
          }))
          .sort((a, b) => b.run.length - a.run.length)[0];
        const rightStemProbe = stemProbeOffsets
          .map((offset) => ({
            offset,
            run: longestVerticalRun(clean, width, height, Math.round(candidateX + spacing * offset), Math.round(y - spacing * 3.2), Math.round(y + spacing * 3.2)),
          }))
          .sort((a, b) => b.run.length - a.run.length)[0];
        const leftStem = leftStemProbe.run;
        const rightStem = rightStemProbe.run;
        const rightAttached =
          rightStem.length > spacing * 1.2 &&
          rightStem.length <= spacing * 4.2 &&
          rightStem.start < y - spacing * 0.9 &&
          rightStem.end >= y - spacing * 0.34 &&
          rightStem.end <= y + spacing * 0.95;
        const leftAttached =
          leftStem.length > spacing * 1.2 &&
          leftStem.length <= spacing * 4.2 &&
          leftStem.start >= y - spacing * 0.95 &&
          leftStem.start <= y + spacing * 0.34 &&
          leftStem.end > y + spacing * 0.9;
        const stemUp = rightAttached || (!leftAttached && rightStem.length >= leftStem.length);
        const stem = stemUp ? rightStem : leftStem;
        const hasStem = rightAttached || leftAttached;
        if (filled && !hasStem) continue;
        if (!filled && headRun < spacing * 0.72) continue;
        if (!filled && !hasStem && headCoverage < spacing * 0.42) continue;
        if (!filled && !hasStem && headRun > spacing * 1.34) continue;
        const runRatio = headRun / spacing;
        const coverageRatio = headCoverage / spacing;
        const runShapeScore = clamp(1 - Math.abs(runRatio - 1.12) / 0.82, 0, 1);
        const coverageShapeScore = clamp(1 - Math.abs(coverageRatio - 0.72) / 0.72, 0, 1);
        const fillEvidence = filled
          ? clamp(innerRatio, 0, 1)
          : clamp((0.58 - innerRatio) / 0.58, 0, 1);
        const headScore =
          clamp(current.score, 0, 1) * 0.42 +
          runShapeScore * 0.16 +
          coverageShapeScore * 0.19 +
          fillEvidence * 0.18 +
          (hasStem ? 0.05 : 0);
        if (headScore < 0.5) continue;
        const centerVerticalRun = longestVerticalRun(
          data,
          width,
          height,
          Math.round(candidateX),
          Math.round(staff.lines[0] - spacing * 0.8),
          Math.round(staff.lines[4] + spacing * 0.8),
        );
        if (centerVerticalRun.length > spacing * 3.6) continue;
        const accidental = detectAccidental(cleanIntegral, clean, width, height, candidateX, y, spacing);
        candidates.push({
          kind: "note",
          staffIndex,
          x: candidateX,
          y,
          step,
          score: headScore,
          filled,
          stemUp,
          stemTop: stemUp ? stem.start : stem.end,
          beats: filled ? 1 : hasStem ? 2 : 4,
          accidental,
          dotted: false,
          dotX: null,
          subdivisionCount: 0,
          stemX: candidateX + spacing * (stemUp ? rightStemProbe.offset : -leftStemProbe.offset),
          rhythmEvidence: {
            primarySpan: 0,
            primaryCoverage: 0,
            secondarySpan: 0,
            secondaryCoverage: 0,
          },
          beamToPrevious: false,
          beamToNext: false,
          articulation: "tongued",
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
        (
          Math.abs(existing.stemX - candidate.stemX) < spacing * 0.5 ||
          Math.abs(existing.x - candidate.x) < spacing * 1.52 ||
          (
            Math.abs(existing.x - candidate.x) < spacing * 1.18 &&
            Math.abs(existing.y - candidate.y) < spacing * 0.9
          )
        ),
    );
    if (!duplicate) kept.push(candidate);
  }
  kept.sort((a, b) => a.staffIndex - b.staffIndex || a.x - b.x);
  staves.forEach((staff, staffIndex) => {
    const staffIndexes = kept
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => candidate.staffIndex === staffIndex);
    const original = staffIndexes.map(({ candidate }) => candidate);
    const optionGroups = original.map((current, localIndex) => {
      const prior = original[localIndex - 1];
      const next = original[localIndex + 1];
      const leftBoundary = prior ? (prior.x + current.x) / 2 : current.x - staff.spacing * 2.2;
      const rightBoundary = next ? (current.x + next.x) / 2 : current.x + staff.spacing * 2.2;
      const alternatives = candidates.filter(
        (candidate) =>
          candidate.staffIndex === staffIndex &&
          candidate.x >= leftBoundary &&
          candidate.x <= rightBoundary &&
          Math.abs(candidate.x - current.x) < staff.spacing * 1.75,
      );
      return alternatives.length > 0 ? alternatives : [current];
    });
    const pathScores: number[][] = [];
    const pathPrevious: number[][] = [];
    optionGroups.forEach((group, groupIndex) => {
      pathScores[groupIndex] = [];
      pathPrevious[groupIndex] = [];
      group.forEach((candidate, optionIndex) => {
        if (groupIndex === 0) {
          pathScores[groupIndex][optionIndex] = candidate.score;
          pathPrevious[groupIndex][optionIndex] = -1;
          return;
        }
        let bestScore = Number.NEGATIVE_INFINITY;
        let bestPrevious = -1;
        optionGroups[groupIndex - 1].forEach((prior, priorIndex) => {
          if (candidate.x - prior.x < staff.spacing * 1.52) return;
          const jumpPenalty = Math.max(0, Math.abs(candidate.step - prior.step) - 2) * 0.045;
          const score = pathScores[groupIndex - 1][priorIndex] + candidate.score - jumpPenalty;
          if (score > bestScore) {
            bestScore = score;
            bestPrevious = priorIndex;
          }
        });
        pathScores[groupIndex][optionIndex] = bestScore;
        pathPrevious[groupIndex][optionIndex] = bestPrevious;
      });
    });
    if (optionGroups.length === 0) return;
    let optionIndex = pathScores.at(-1)!.reduce(
      (best, score, index, row) => (score > row[best] ? index : best),
      0,
    );
    for (let groupIndex = optionGroups.length - 1; groupIndex >= 0; groupIndex -= 1) {
      kept[staffIndexes[groupIndex].index] = optionGroups[groupIndex][optionIndex];
      optionIndex = pathPrevious[groupIndex][optionIndex];
      if (optionIndex < 0 && groupIndex > 0) optionIndex = 0;
    }
  });
  kept.sort((a, b) => a.staffIndex - b.staffIndex || a.x - b.x);
  kept.forEach((candidate) => {
    refineNoteHeadPosition(
      data,
      clean,
      width,
      height,
      candidate,
      staves[candidate.staffIndex],
    );
  });
  kept.forEach((candidate, index) => {
    if (!candidate.accidental) return;
    const spacing = staves[candidate.staffIndex].spacing;
    const previousNote = kept[index - 1];
    if (
      previousNote?.staffIndex === candidate.staffIndex &&
      candidate.x - previousNote.x < spacing * 2.2
    ) {
      candidate.accidental = "";
    }
  });
  kept.forEach((candidate) => {
    const spacing = staves[candidate.staffIndex].spacing;
    candidate.dotX = detectAugmentationDot(
      data,
      width,
      height,
      candidate.x + spacing * 0.72,
      candidate.y,
      spacing,
    );
    candidate.dotted = candidate.dotX !== null;
    if (candidate.dotX !== null) {
      const verticalRun = longestVerticalRun(
        data,
        width,
        height,
        Math.round(candidate.dotX),
        Math.round(candidate.y - spacing * 3.5),
        Math.round(candidate.y + spacing * 3.5),
      );
      if (verticalRun.length > spacing * 1.35) {
        candidate.dotX = null;
        candidate.dotted = false;
      }
    }
  });
  kept.forEach((candidate, index) => {
    if (candidate.dotX === null) return;
    const next = kept[index + 1];
    if (next?.staffIndex !== candidate.staffIndex) return;
    const spacing = staves[candidate.staffIndex].spacing;
    const midpoint = (candidate.x + next.x) / 2;
    if (candidate.dotX >= midpoint - spacing * 0.12) {
      candidate.dotX = null;
      candidate.dotted = false;
    }
  });

  kept.forEach((candidate) => {
    if (!candidate.filled || candidate.dotted) return;
    const spacing = staves[candidate.staffIndex].spacing;
    const evidence = detectStemSubdivisionCount(
      clean,
      width,
      height,
      candidate,
      spacing,
    );
    candidate.subdivisionCount = evidence.count;
    candidate.rhythmEvidence = evidence;
  });

  for (let index = 0; index < kept.length - 1; index += 1) {
    const first = kept[index];
    const second = kept[index + 1];
    if (!first.filled || !second.filled || first.staffIndex !== second.staffIndex) continue;
    if (first.stemUp !== second.stemUp) continue;
    const spacing = staves[first.staffIndex].spacing;
    const maximumBeamGap = first.dotted || second.dotted ? spacing * 7.2 : spacing * 4.6;
    if (second.x - first.x > maximumBeamGap) continue;
    const beamCount = detectBeamCount(clean, width, height, first, second, spacing);
    if (beamCount > 0) {
      first.beamToNext = true;
      second.beamToPrevious = true;
    }
    first.subdivisionCount = Math.max(first.subdivisionCount, beamCount);
    second.subdivisionCount = Math.max(second.subdivisionCount, beamCount);
  }

  kept.forEach((candidate) => {
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
  const candidates: RestCandidate[] = [];

  staves.forEach((staff, staffIndex) => {
    const spacing = staff.spacing;
    const clefAndMeterWidth = staffIndex === 0 ? spacing * 6.2 : spacing * 4.05;
    const startX = Math.max(staff.left + clefAndMeterWidth, width * 0.045);
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
      const barlineRun = longestVerticalRun(
        clean,
        width,
        height,
        Math.round(x),
        Math.round(staff.lines[0] - spacing),
        Math.round(staff.lines[4] + spacing),
      );
      if (barlineRun.length > spacing * 3.15) continue;
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

      const dotted = detectAugmentationDot(clean, width, height, component.x1, y, spacing) !== null;
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

function detectSlurArticulations(
  clean: Uint8Array,
  width: number,
  height: number,
  staves: Staff[],
  notes: NoteCandidate[],
  barlines: number[][],
) {
  let slurCount = 0;
  staves.forEach((staff, staffIndex) => {
    const spacing = staff.spacing;
    const staffNotes = notes.filter((note) => note.staffIndex === staffIndex);
    if (staffNotes.length < 2) return;
    const slurInk = clean.slice();
    const staffBand = Math.max(1, Math.round(spacing * 0.22));
    staff.lines.forEach((line) => {
      for (let y = Math.max(0, Math.round(line) - staffBand); y <= Math.min(height - 1, Math.round(line) + staffBand); y += 1) {
        slurInk.fill(0, y * width + staff.left, y * width + staff.right + 1);
      }
    });
    staffNotes.forEach((note) => {
      const headLeft = clamp(Math.round(note.x - spacing * 0.68), 0, width - 1);
      const headRight = clamp(Math.round(note.x + spacing * 0.68), 0, width - 1);
      const headTop = clamp(Math.round(note.y - spacing * 0.58), 0, height - 1);
      const headBottom = clamp(Math.round(note.y + spacing * 0.58), 0, height - 1);
      for (let y = headTop; y <= headBottom; y += 1) {
        slurInk.fill(0, y * width + headLeft, y * width + headRight + 1);
      }
      const stemLeft = clamp(Math.round(note.stemX - spacing * 0.24), 0, width - 1);
      const stemRight = clamp(Math.round(note.stemX + spacing * 0.24), 0, width - 1);
      const stemTop = clamp(Math.round(Math.min(note.y, note.stemTop) - spacing * 0.3), 0, height - 1);
      const stemBottom = clamp(Math.round(Math.max(note.y, note.stemTop) + spacing * 0.3), 0, height - 1);
      for (let y = stemTop; y <= stemBottom; y += 1) {
        slurInk.fill(0, y * width + stemLeft, y * width + stemRight + 1);
      }
    });
    for (let index = 0; index < staffNotes.length - 1; index += 1) {
      const first = staffNotes[index];
      const second = staffNotes[index + 1];
      if (!first.beamToNext || !second.beamToPrevious) continue;
      const left = Math.round(Math.min(first.stemX, second.stemX));
      const right = Math.round(Math.max(first.stemX, second.stemX));
      const beamBand = Math.max(2, Math.round(spacing * 0.48));
      for (let x = left; x <= right; x += 1) {
        const progress = (x - left) / Math.max(1, right - left);
        const center = Math.round(first.stemTop + (second.stemTop - first.stemTop) * progress);
        for (let y = Math.max(0, center - beamBand); y <= Math.min(height - 1, center + beamBand); y += 1) {
          slurInk[y * width + x] = 0;
        }
      }
    }
    const intervals: Array<{ start: number; end: number; score: number }> = [];
    const addInterval = (start: number, end: number, score: number) => {
      if (end <= start) return;
      const duplicate = intervals.find((interval) => interval.start === start && interval.end === end);
      if (duplicate) duplicate.score = Math.max(duplicate.score, score);
      else intervals.push({ start, end, score });
    };
    const components = connectedComponents(slurInk, width, height, {
      x0: staff.left,
      y0: staff.lines[0] - spacing * 4.4,
      x1: staff.right,
      y1: staff.lines[4] + spacing * 4.4,
    }, true);
    const possibleSlurs = components
      .map((component) => {
        const componentWidth = component.x1 - component.x0 + 1;
        const componentHeight = component.y1 - component.y0 + 1;
        const density = component.pixels / Math.max(1, componentWidth * componentHeight);
        return { component, componentWidth, componentHeight, density };
      })
      .filter(({ componentWidth, componentHeight, density }) =>
        componentWidth >= spacing * 0.55 &&
        componentWidth <= spacing * 15 &&
        componentHeight >= spacing * 0.14 &&
        componentHeight <= spacing * 2.45 &&
        componentWidth / Math.max(1, componentHeight) >= 2.25 &&
        density >= 0.035 && density <= 0.48,
      )
      .sort((a, b) => a.component.x0 - b.component.x0);

    possibleSlurs.forEach(({ component, componentWidth, componentHeight, density }) => {
      const included = staffNotes.filter(
        (note) => note.x >= component.x0 - spacing * 1.25 && note.x <= component.x1 + spacing * 1.25,
      );
      if (included.length < 2 || included.length > 10) return;
      const first = included[0];
      const last = included.at(-1)!;
      if (
        Math.abs(first.x - component.x0) > spacing * 2 ||
        Math.abs(last.x - component.x1) > spacing * 2
      ) return;
      const centerY = (component.y0 + component.y1) / 2;
      const highestHead = Math.min(...included.map((note) => note.y));
      const lowestHead = Math.max(...included.map((note) => note.y));
      const isAbove = centerY < highestHead - spacing * 0.42 && component.y0 < highestHead - spacing * 0.62;
      const isBelow = centerY > lowestHead + spacing * 0.42 && component.y1 > lowestHead + spacing * 0.62;
      if (!isAbove && !isBelow) return;

      // A beam is a dense, almost straight band; a slur has a visibly curved top/bottom profile.
      const columnCenters: number[] = [];
      const sampleCount = 7;
      for (let sample = 0; sample < sampleCount; sample += 1) {
        const x = Math.round(component.x0 + (componentWidth - 1) * (sample / (sampleCount - 1)));
        let weightedY = 0;
        let ink = 0;
        for (let y = component.y0; y <= component.y1; y += 1) {
          if (!slurInk[y * width + x]) continue;
          weightedY += y;
          ink += 1;
        }
        if (ink > 0) columnCenters.push(weightedY / ink);
      }
      if (columnCenters.length < 4) return;
      const endAverage = (columnCenters[0] + columnCenters.at(-1)!) / 2;
      const middle = columnCenters[Math.floor(columnCenters.length / 2)];
      const curvature = Math.abs(middle - endAverage);
      if (curvature < Math.max(0.7, componentHeight * 0.075)) return;
      const start = staffNotes.indexOf(first);
      const end = staffNotes.indexOf(last);
      addInterval(
        start,
        end,
        clamp(0.7 + curvature / Math.max(1, componentHeight) * 0.16 - density * 0.12, 0.62, 0.9),
      );
    });

    const curvedStrokeScore = (start: number, end: number, direction: -1 | 1) => {
      const first = staffNotes[start];
      const last = staffNotes[end];
      const x0 = Math.round(first.x);
      const x1 = Math.round(last.x);
      const span = x1 - x0;
      if (span < spacing * 1.35 || span > spacing * 15) return 0;
      const tolerance = Math.max(1, Math.round(spacing * 0.17));
      let best = 0;
      for (const endpointOffset of [0.28, 0.48, 0.7, 0.92]) {
        for (const archHeight of [0.28, 0.48, 0.72, 1.02, 1.38]) {
          let covered = 0;
          let strong = 0;
          let samples = 0;
          const inset = Math.max(1, Math.round(span * 0.025));
          for (let x = x0 + inset; x <= x1 - inset; x += 1) {
            const progress = (x - x0) / Math.max(1, span);
            const baseline = first.y + (last.y - first.y) * progress;
            const curve = direction * spacing * (
              endpointOffset + archHeight * 4 * progress * (1 - progress)
            );
            const expectedY = Math.round(baseline + curve);
            let ink = 0;
            for (let dy = -tolerance; dy <= tolerance; dy += 1) {
              const y = expectedY + dy;
              if (y >= 0 && y < height) ink += slurInk[y * width + x];
            }
            covered += Number(ink > 0);
            strong += Number(ink >= 2);
            samples += 1;
          }
          const coverage = covered / Math.max(1, samples);
          const strongCoverage = strong / Math.max(1, samples);
          best = Math.max(best, coverage * 0.72 + strongCoverage * 0.28);
        }
      }
      return best;
    };

    const componentIntervals = [...intervals];
    componentIntervals.forEach((interval) => {
      for (let end = interval.end + 1; end < Math.min(staffNotes.length, interval.end + 4); end += 1) {
        if (staffNotes[end].x - staffNotes[end - 1].x > spacing * 4.8) break;
        if (barlines[staffIndex].some((barline) => barline > staffNotes[interval.start].x && barline < staffNotes[end].x)) break;
        const extensionScore = Math.max(
          curvedStrokeScore(interval.start, end, -1),
          curvedStrokeScore(interval.start, end, 1),
        );
        if (extensionScore >= 0.44) {
          addInterval(interval.start, end, Math.max(extensionScore, interval.score - 0.05));
        }
      }
    });

    for (let start = 0; start < staffNotes.length - 1; start += 1) {
      for (let end = start + 1; end < Math.min(staffNotes.length, start + 9); end += 1) {
        const gap = staffNotes[end].x - staffNotes[end - 1].x;
        if (gap > spacing * 7.8) break;
        if (barlines[staffIndex].some((barline) => barline > staffNotes[start].x && barline < staffNotes[end].x)) break;
        const score = Math.max(
          curvedStrokeScore(start, end, -1),
          curvedStrokeScore(start, end, 1),
        );
        if (score >= 0.58) addInterval(start, end, score);
      }
    }

    const selected: typeof intervals = [];
    intervals
      .sort((a, b) =>
        (b.score + Math.min(0.18, (b.end - b.start) * 0.035)) -
        (a.score + Math.min(0.18, (a.end - a.start) * 0.035)),
      )
      .forEach((interval) => {
        const overlaps = selected.some(
          (existing) => interval.start <= existing.end && interval.end >= existing.start,
        );
        if (!overlaps) selected.push(interval);
      });
    selected
      .sort((a, b) => a.start - b.start)
      .forEach(({ start, end }) => {
        staffNotes[start].articulation = "slur-start";
        for (let index = start + 1; index <= end; index += 1) {
          staffNotes[index].articulation = "slurred";
        }
        slurCount += 1;
      });
  });
  return slurCount;
}

function filterBarlines(staves: Staff[], candidates: Candidate[], bareBarlines: number[][]) {
  return bareBarlines.map((staffBarlines, staffIndex) => {
    const spacing = staves[staffIndex].spacing;
    const staffNotes = candidates.filter(
      (candidate): candidate is NoteCandidate =>
        candidate.kind === "note" && candidate.staffIndex === staffIndex,
    );
    return staffBarlines.filter(
      (barline) => !staffNotes.some(
        (note) =>
          Math.abs(note.stemX - barline) < spacing * 0.82 ||
          Math.abs(note.x - barline) < spacing * 1.05,
      ),
    );
  });
}

function rhythmOptions(candidate: Candidate, targetBeats: number) {
  if (candidate.kind === "rest") {
    return [candidate.restType === "whole" ? targetBeats : candidate.beats];
  }
  if (!candidate.filled) return [candidate.beats];
  const multiplier = candidate.dotted ? 1.5 : 1;
  const baseOptions = candidate.dotted ? [1, 0.5] : [1, 0.5, 0.25];
  return baseOptions.map((beats) => beats * multiplier);
}

function rhythmChoiceCost(candidate: Candidate, beats: number) {
  if (candidate.kind === "rest" || !candidate.filled) return 0;
  const plainBeats = beats / (candidate.dotted ? 1.5 : 1);
  const level = plainBeats >= 0.99 ? 0 : plainBeats >= 0.49 ? 1 : 2;
  let cost = Math.abs(level - candidate.subdivisionCount) * 0.7;
  const isBeamed = candidate.beamToPrevious || candidate.beamToNext;
  if (isBeamed && level === 0) cost += 1.15;
  if (!isBeamed && candidate.subdivisionCount === 0 && level > 0) cost += level * 0.22;
  return cost;
}

function decodeMeasureRhythm(events: Candidate[], targetBeats: number) {
  const targetUnits = Math.round(targetBeats * 4);
  let bestUnits = -1;
  let best: { cost: number; beats: number[] } | null = null;
  const beamGroupingCost = (beats: number[]) => {
    let cost = 0;
    let groupTotal = 0;
    let groupLength = 0;
    const commit = () => {
      if (groupLength >= 2) {
        const preferredTotal = groupLength >= 5 ? Math.min(2, targetBeats) : 1;
        cost += Math.abs(groupTotal - preferredTotal) * 2.2;
      }
      groupTotal = 0;
      groupLength = 0;
    };
    events.forEach((event, index) => {
      if (event.kind !== "note") {
        commit();
        return;
      }
      if (!event.beamToPrevious) commit();
      groupTotal += beats[index];
      groupLength += 1;
      if (!event.beamToNext) commit();
    });
    commit();
    return cost;
  };
  const visit = (index: number, units: number, cost: number, beats: number[]) => {
    if (units > targetUnits + 8) return;
    if (index === events.length) {
      const totalCost = cost + Math.abs(units - targetUnits) * 1.8 + beamGroupingCost(beats);
      if (!best || totalCost < best.cost) {
        bestUnits = units;
        best = { cost: totalCost, beats: [...beats] };
      }
      return;
    }
    for (const option of rhythmOptions(events[index], targetBeats)) {
      beats.push(option);
      visit(
        index + 1,
        units + Math.round(option * 4),
        cost + rhythmChoiceCost(events[index], option),
        beats,
      );
      beats.pop();
    }
  };
  visit(0, 0, 0, []);
  const winner = best as { cost: number; beats: number[] } | null;
  return {
    beats: winner?.beats ?? events.map((event) => event.beats),
    cost: winner?.cost ?? 99,
    exact: bestUnits === targetUnits,
  };
}

function groupMeasures(candidates: Candidate[], barlines: number[][]) {
  const measures: Candidate[][] = [];
  const maximumStaff = Math.max(-1, ...candidates.map((candidate) => candidate.staffIndex));
  for (let staffIndex = 0; staffIndex <= maximumStaff; staffIndex += 1) {
    const staffEvents = candidates.filter((candidate) => candidate.staffIndex === staffIndex);
    const groups = new Map<number, Candidate[]>();
    for (const event of staffEvents) {
      const measureIndex = barlines[staffIndex].filter((barline) => barline < event.x).length;
      const group = groups.get(measureIndex) ?? [];
      group.push(event);
      groups.set(measureIndex, group);
    }
    measures.push(...groups.values());
  }
  return measures.filter((measure) => measure.length > 0);
}

function decodeRhythmByMeasure(candidates: Candidate[], barlines: number[][], staves: Staff[]) {
  const staffNotes = candidates.filter((candidate): candidate is NoteCandidate => candidate.kind === "note");
  staffNotes.forEach((note, index) => {
    const previous = staffNotes[index - 1];
    if (!previous || previous.staffIndex !== note.staffIndex) return;
    const crossesBarline = barlines[note.staffIndex].some(
      (barline) => barline > previous.x && barline < note.x,
    );
    if (crossesBarline) {
      previous.beamToNext = false;
      note.beamToPrevious = false;
    }
  });
  staffNotes.forEach((note, index) => {
    const previous = staffNotes[index - 1];
    if (
      previous && previous.staffIndex === note.staffIndex &&
      !previous.beamToNext && !note.beamToPrevious && note.beamToNext &&
      previous.stemUp === note.stemUp &&
      note.x - previous.x < staves[note.staffIndex].spacing * 4.4 &&
      !barlines[note.staffIndex].some((barline) => barline > previous.x && barline < note.x)
    ) {
      previous.beamToNext = true;
      note.beamToPrevious = true;
    }
  });
  let beamGroup: NoteCandidate[] = [];
  const commitBeamGroup = () => {
    if (beamGroup.length >= 4) {
      const sixteenthEvidence = beamGroup.filter((note) => note.subdivisionCount === 2).length;
      if (sixteenthEvidence >= Math.ceil(beamGroup.length / 2)) {
        beamGroup.forEach((note) => { note.subdivisionCount = 2; });
      }
    }
    beamGroup = [];
  };
  staffNotes.forEach((note, index) => {
    const previous = staffNotes[index - 1];
    if (!previous || previous.staffIndex !== note.staffIndex || !note.beamToPrevious) commitBeamGroup();
    beamGroup.push(note);
    if (!note.beamToNext) commitBeamGroup();
  });
  commitBeamGroup();

  const measures = groupMeasures(candidates, barlines);
  const meterCandidates = [2, 3, 4].map((beats) => {
    const decoded = measures.map((measure) => decodeMeasureRhythm(measure, beats));
    const exactCount = decoded.filter((measure) => measure.exact).length;
    const cost = decoded.reduce((sum, measure) => sum + measure.cost, 0) +
      (decoded.length - exactCount) * 4 + beats * 0.12;
    return { beats, decoded, exactCount, cost };
  });
  const bestMeter = meterCandidates.reduce((best, current) =>
    current.cost < best.cost ? current : best,
  );
  bestMeter.decoded.forEach((decoded, measureIndex) => {
    measures[measureIndex].forEach((event, eventIndex) => {
      const beats = decoded.beats[eventIndex];
      event.beats = beats;
      if (event.kind === "note" && event.filled) {
        const plainBeats = beats / (event.dotted ? 1.5 : 1);
        event.subdivisionCount = plainBeats >= 0.99 ? 0 : plainBeats >= 0.49 ? 1 : 2;
      }
    });
  });
  return bestMeter.beats;
}

function detectScoreCandidates(binary: BinaryImage) {
  const staves = detectStaves(binary);
  if (staves.length === 0) return {
    staves,
    candidates: [] as Candidate[],
    barlines: [] as number[][],
    meterBeats: 4,
    slurCount: 0,
  };
  const clean = removeStaffLines(binary, staves);
  const notes = detectNoteCandidates(binary, clean, staves);
  const rests = detectRestCandidates(binary, clean, staves, notes);
  const candidates: Candidate[] = [...notes, ...rests]
    .sort((a, b) => a.staffIndex - b.staffIndex || a.x - b.x)
    .slice(0, 192);
  const barlines = filterBarlines(staves, candidates, detectBarlines(binary, staves));
  const slurCount = detectSlurArticulations(
    clean,
    binary.width,
    binary.height,
    staves,
    notes,
    barlines,
  );
  const meterBeats = decodeRhythmByMeasure(candidates, barlines, staves);
  return { staves, candidates, barlines, meterBeats, slurCount };
}

export function recognizeBinaryScore(binary: BinaryImage): {
  staffCount: number;
  events: BinaryScoreEvent[];
  barlines: number[][];
  meterBeats: number;
  slurCount: number;
} {
  const { staves, candidates, barlines, meterBeats, slurCount } = detectScoreCandidates(binary);
  return {
    staffCount: staves.length,
    barlines,
    meterBeats,
    slurCount,
    events: candidates.map((candidate) => ({
      kind: candidate.kind,
      written: candidate.kind === "rest"
        ? "休"
        : pitchFromStaffStep(candidate.step, candidate.accidental),
      beats: candidate.beats,
      rhythmMark: candidate.dotted ? "dotted" : "plain",
      staffIndex: candidate.staffIndex,
      x: candidate.x,
      y: candidate.y,
      confidence: candidate.kind === "rest"
        ? clamp(candidate.score, 0.46, 0.94)
        : clamp(0.42 + candidate.score * 1.25, 0.46, 0.98),
      subdivisionCount: candidate.kind === "note" ? candidate.subdivisionCount : 0,
      measureIndex: barlines[candidate.staffIndex].filter((barline) => barline < candidate.x).length,
      articulation: candidate.kind === "note" ? candidate.articulation : "silent",
      restType: candidate.kind === "rest" ? candidate.restType : null,
    })),
  };
}

function annotatePreview(canvas: HTMLCanvasElement, staves: Staff[], candidates: Candidate[], notes: LessonNote[]) {
  const context = canvas.getContext("2d");
  if (!context) return canvas.toDataURL("image/jpeg", 0.88);
  context.save();
  context.lineWidth = Math.max(2, canvas.width / 700);
  const fontSize = Math.max(11, canvas.width / 115);
  context.font = `700 ${fontSize}px Arial, sans-serif`;
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
  const labelRows = staves.map(() => [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]);
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
    const note = notes[index];
    const rhythmLabel = note?.beats === 0.25 ? "16" : note?.beats === 0.5 ? "8" : note?.beats === 0.75 ? "附8" : note?.beats === 1 ? "4" : note?.beats === 1.5 ? "附4" : note?.beats === 2 ? "2" : `${note?.beats ?? "?"}拍`;
    const articulationLabel = note?.kind === "note"
      ? note.articulation === "tongued" ? "吐" : "连"
      : "静";
    const label = `${note?.kind === "rest" ? "休" : note?.written ?? "?"} · ${rhythmLabel} · ${articulationLabel}`;
    const metrics = context.measureText(label);
    const paddingX = Math.max(3, spacing * 0.24);
    const labelWidth = metrics.width + paddingX * 2;
    const labelLeft = clamp(candidate.x - labelWidth / 2, 2, canvas.width - labelWidth - 2);
    const rowRights = labelRows[candidate.staffIndex];
    let row = rowRights.findIndex((right) => right + spacing * 0.3 <= labelLeft);
    if (row < 0) row = rowRights.indexOf(Math.min(...rowRights));
    rowRights[row] = labelLeft + labelWidth;
    const baseline = staves[candidate.staffIndex].lines[0] - spacing * (1.1 + row * 1.2);
    const labelHeight = fontSize * 1.35;
    context.fillStyle = "rgba(255, 253, 247, .94)";
    context.fillRect(labelLeft, baseline - labelHeight, labelWidth, labelHeight);
    context.strokeStyle = isRest ? "rgba(51,127,158,.66)" : "rgba(233,104,74,.66)";
    context.strokeRect(labelLeft, baseline - labelHeight, labelWidth, labelHeight);
    context.beginPath();
    context.moveTo(candidate.x, baseline);
    context.lineTo(candidate.x, candidate.y - spacing * 0.82);
    context.stroke();
    context.fillStyle = isRest ? "#246d89" : "#be4d36";
    context.fillText(label, labelLeft + paddingX, baseline - fontSize * 0.08);
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
  const { staves, candidates, meterBeats, slurCount } = detectScoreCandidates(binary);
  if (staves.length === 0) {
    throw new Error("没有找到连续的五条谱线，请裁掉多余背景并保持照片水平后重试");
  }
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
      articulation: candidate.articulation,
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
    meterBeats,
    slurNoteCount: notes.filter(
      (note) => note.kind === "note" && note.articulation !== "tongued",
    ).length,
    slurGroupCount: slurCount,
  };
}
