// Leonida Postcard — the cover render engine.
// Draws the whole cover onto any canvas at any size: layouts, gradient-map
// grades, Anton/Pacifico lettering, sun, palms, grain and vignette. All art is
// drawn in code; no image asset is ever loaded except the user's own photos.

export const LAYOUTS = {
  hero: { name: 'Hero + film strip' },
  tilted: { name: 'Tilted snapshots' },
  nine: { name: 'Nine-panel grid' },
  single: { name: 'Full-bleed single' },
  'hero-three': { name: 'Hero + three' },
};

export const GRADES = {
  sunset: { name: 'Vice Sunset', mix: 0.75 },
  neon: { name: 'Neon Night', mix: 0.8 },
  golden: { name: 'Golden Hour', mix: 0.7 },
  duotone: { name: 'Duotone Vice', mix: 0.85 },
  noir: { name: 'Noir', mix: 1 },
  original: { name: 'Original', mix: 0 },
};

export const SIZES = [
  { id: '1080x1080', w: 1080, h: 1080, name: 'Square 1080 × 1080' },
  { id: '1080x1350', w: 1080, h: 1350, name: 'Portrait 1080 × 1350' },
  { id: '1920x1080', w: 1920, h: 1080, name: 'Landscape 1920 × 1080' },
  { id: '1080x1920', w: 1080, h: 1920, name: 'Story 1080 × 1920' },
];

export const DEFAULT_TITLES = ['Neon Shore', 'Sunset Heist', 'Boulevard Queen'];

// Gradient-map stops per grade: [position 0..1, [r, g, b]].
const GRADE_STOPS = {
  sunset: [[0, [26, 11, 46]], [0.45, [214, 51, 132]], [0.8, [255, 140, 80]], [1, [255, 214, 140]]],
  neon: [[0, [8, 8, 46]], [0.5, [255, 45, 149]], [0.85, [77, 232, 232]], [1, [214, 255, 255]]],
  golden: [[0, [46, 26, 11]], [0.5, [232, 163, 61]], [1, [255, 233, 168]]],
  duotone: [[0, [18, 4, 31]], [0.55, [255, 93, 162]], [1, [255, 214, 240]]],
};

const LUTS = {};
function buildLut(grade) {
  if (LUTS[grade]) return LUTS[grade];
  const lut = new Uint8Array(256 * 3);
  const stops = GRADE_STOPS[grade];
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
    }
    const f = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(a[1][c] + (b[1][c] - a[1][c]) * f);
  }
  LUTS[grade] = lut;
  return lut;
}

/** Applies a grade to raw RGBA pixels in place. */
export function applyGrade(data, grade) {
  const mix = GRADES[grade].mix;
  if (mix === 0) return;
  if (grade === 'noir') {
    for (let i = 0; i < data.length; i += 4) {
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const c = Math.max(0, Math.min(255, (l / 255 - 0.5) * 1.25 + 0.5) * 255);
      data[i] = Math.min(255, c * 1.06);
      data[i + 1] = c;
      data[i + 2] = Math.min(255, c * 0.92);
    }
    return;
  }
  const lut = buildLut(grade);
  for (let i = 0; i < data.length; i += 4) {
    const l = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    for (let c = 0; c < 3; c++) {
      const m = lut[l * 3 + c];
      data[i + c] = Math.round(m * mix + data[i + c] * (1 - mix));
    }
  }
}

function imgSize(src) {
  return { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
}

/** The photo with a grade baked in, cached per image and grade. */
export function gradedSource(img, grade) {
  if (grade === 'original') return img;
  const key = grade;
  if (img.__graded && img.__gradedKey === key) return img.__graded;
  const { w, h } = imgSize(img);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, w, h);
  applyGrade(data.data, grade);
  g.putImageData(data, 0, 0);
  img.__graded = c;
  img.__gradedKey = key;
  return c;
}

/** The source rotated by a multiple of 90 degrees, cached per image and angle. */
export function rotatedSource(src, rot) {
  const r = ((rot % 360) + 360) % 360;
  if (r === 0) return src;
  const key = `rot${r}`;
  if (src.__rotated && src.__rotatedKey === key) return src.__rotated;
  const { w, h } = imgSize(src);
  const swap = r === 90 || r === 270;
  const c = document.createElement('canvas');
  c.width = swap ? h : w;
  c.height = swap ? w : h;
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  g.rotate((r * Math.PI) / 180);
  g.drawImage(src, -w / 2, -h / 2, w, h);
  src.__rotated = c;
  src.__rotatedKey = key;
  return c;
}

/** Draws a photo into a rectangle, cover-fit, panned and zoomed by its crop.
 *  The crop centre is clamped so the photo always covers the whole rectangle. */
export function drawPhotoInto(ctx, src, rect, crop) {
  const { w: iw, h: ih } = imgSize(src);
  const scale = Math.max(rect.w / iw, rect.h / ih) * crop.zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const cx = Math.max(rect.w / (2 * dw), Math.min(1 - rect.w / (2 * dw), crop.cx));
  const cy = Math.max(rect.h / (2 * dh), Math.min(1 - rect.h / (2 * dh), crop.cy));
  const ox = rect.x + rect.w / 2 - cx * dw;
  const oy = rect.y + rect.h / 2 - cy * dh;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.drawImage(src, ox, oy, dw, dh);
  ctx.restore();
}

/** The crop-centre range that keeps a photo covering a rectangle at a zoom. */
export function cropRange(rect, iw, ih, zoom) {
  const scale = Math.max(rect.w / iw, rect.h / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  return {
    cxMin: rect.w / (2 * dw),
    cxMax: 1 - rect.w / (2 * dw),
    cyMin: rect.h / (2 * dh),
    cyMax: 1 - rect.h / (2 * dh),
  };
}

// A small deterministic PRNG, so the film grain is the same on every render.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const rand = mulberry32(20261119);
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 160;
  const g = c.getContext('2d');
  const data = g.createImageData(160, 160);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = Math.floor(rand() * 256);
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  g.putImageData(data, 0, 0);
  grainTile = c;
  return c;
}

export function drawGrain(ctx, w, h) {
  const tile = getGrainTile();
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.globalCompositeOperation = 'overlay';
  for (let y = 0; y < h; y += 160) {
    for (let x = 0; x < w; x += 160) ctx.drawImage(tile, x, y);
  }
  ctx.restore();
}

export function drawVignette(ctx, w, h) {
  const g = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.45,
    w / 2, h / 2, Math.max(w, h) * 0.75,
  );
  g.addColorStop(0, 'rgba(8, 3, 18, 0)');
  g.addColorStop(1, 'rgba(8, 3, 18, 0.42)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** A synthwave sun disc with slats cut from its lower half. */
export function drawSun(ctx, x, y, r) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(r * 2);
  c.height = Math.ceil(r * 2);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(r, r, r * 0.08, r, r, r);
  grad.addColorStop(0, '#fff7d6');
  grad.addColorStop(0.55, '#ffb347');
  grad.addColorStop(1, '#ff5da2');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(r, r, r, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  let gap = r * 0.07;
  for (let i = 0; i < 4; i++) {
    const yy = r + r * 0.12 + i * r * 0.22;
    g.fillRect(0, yy, r * 2, gap);
    gap *= 1.7;
  }
  ctx.drawImage(c, x - r, y - r);
}

/** A palm silhouette. (x, y) is the base; it grows upward, or downward when flipped. */
export function drawPalm(ctx, x, y, s, lean = 0, flip = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, flip ? -s : s);
  ctx.rotate(lean);
  ctx.fillStyle = '#160826';
  ctx.beginPath();
  ctx.moveTo(-4, 0);
  ctx.quadraticCurveTo(-9, -50, 2, -95);
  ctx.lineTo(9, -95);
  ctx.quadraticCurveTo(3, -45, 7, 0);
  ctx.closePath();
  ctx.fill();
  const spread = [-1.5, -0.9, -0.3, 0.3, 0.9, 1.5];
  for (const a of spread) {
    const tx = 5 + Math.sin(a) * 76;
    const ty = -95 - Math.cos(a) * 34 - 22;
    ctx.beginPath();
    ctx.moveTo(5, -95);
    ctx.quadraticCurveTo(5 + Math.sin(a) * 40, -95 - Math.cos(a) * 28 - 10, tx, ty);
    ctx.quadraticCurveTo(5 + Math.sin(a) * 36, -95 - Math.cos(a) * 12 + 10, 5, -95);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawStar(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  // A thin dark edge, so a gold star still reads on a gold photo (Golden Hour).
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(16, 6, 28, 0.85)';
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.stroke();
}

/** The LEONIDA badge ribbon with a five-star heat meter. */
export function drawBadge(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#c2187a';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-14, 8);
  ctx.lineTo(0, 26);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(150, 0);
  ctx.lineTo(164, 8);
  ctx.lineTo(150, 26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff2d95';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(150, 0);
  ctx.lineTo(140, 26);
  ctx.lineTo(10, 26);
  ctx.closePath();
  ctx.fill();
  ctx.font = '400 17px Anton, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LEONIDA', 75, 14);
  for (let i = 0; i < 5; i++) drawStar(ctx, 28 + i * 24, 46, 9, '#ffb347');
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Layouts. Every plan is fractions of the cover size, so one design serves
// square, portrait, landscape and story exports alike.
// ---------------------------------------------------------------------------

export function planLayout(layout, w, h) {
  const min = Math.min(w, h);
  if (layout === 'tilted') {
    return {
      sky: true,
      panels: [
        { id: 'tilt-0', name: 'Snapshot 1', x: w * 0.05, y: h * 0.07, w: w * 0.42, h: h * 0.36, tilt: -5, frame: 'white' },
        { id: 'tilt-1', name: 'Snapshot 2', x: w * 0.53, y: h * 0.05, w: w * 0.42, h: h * 0.36, tilt: 4, frame: 'white' },
        { id: 'tilt-2', name: 'Snapshot 3', x: w * 0.08, y: h * 0.47, w: w * 0.40, h: h * 0.34, tilt: 3, frame: 'white' },
        { id: 'tilt-3', name: 'Snapshot 4', x: w * 0.54, y: h * 0.49, w: w * 0.40, h: h * 0.34, tilt: -4, frame: 'white' },
      ],
      title: { x: w * 0.08, y: h * 0.83, w: w * 0.84, h: h * 0.12, align: 'center' },
      subtitle: { x: 0, y: h * 0.94, w, size: Math.round(min * 0.038), align: 'center' },
      badge: { x: w * 0.86, y: h * 0.015, scale: w / 1920 },
      sun: null,
      palms: [
        { x: w * 0.02, y: h, s: h / 650, lean: 0.1 },
        { x: w * 0.98, y: h, s: h / 700, lean: -0.1 },
      ],
    };
  }
  if (layout === 'nine') {
    const m = Math.round(min * 0.02);
    const g = Math.round(min * 0.012);
    const cw = (w - 2 * m - 2 * g) / 3;
    const ch = (h - 2 * m - 2 * g) / 3;
    const cell = (col, row) => ({ x: m + col * (cw + g), y: m + row * (ch + g), w: cw, h: ch });
    const panels = [];
    let n = 0;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (row === 1 && col === 1) continue;
        panels.push({ id: `cell-${n}`, name: `Panel ${n + 1}`, ...cell(col, row), tilt: 0, frame: 'white' });
        n++;
      }
    }
    const titleCell = cell(1, 1);
    return {
      sky: false,
      panels,
      titleCell,
      title: { x: titleCell.x + cw * 0.06, y: titleCell.y + ch * 0.16, w: cw * 0.88, h: ch * 0.48, align: 'center' },
      subtitle: { x: titleCell.x, y: titleCell.y + ch * 0.68, w: cw, size: Math.round(min * 0.032), align: 'center' },
      badge: { x: w - m - cw * 0.4, y: m + ch * 0.04, scale: w / 1920 },
      sun: null,
      palms: [],
    };
  }
  if (layout === 'single') {
    return {
      sky: false,
      panels: [{ id: 'full', name: 'Photo', x: 0, y: 0, w, h, tilt: 0, frame: 'none' }],
      title: { x: w * 0.08, y: h * 0.56, w: w * 0.84, h: h * 0.22, align: 'center' },
      subtitle: { x: 0, y: h * 0.79, w, size: Math.round(min * 0.042), align: 'center' },
      badge: { x: w * 0.86, y: h * 0.03, scale: w / 1920 },
      sun: { x: w * 0.84, y: h * 0.16, r: min * 0.12 },
      palms: [
        { x: w * 0.03, y: h, s: h / 620, lean: 0.1 },
        { x: w * 0.97, y: h, s: h / 680, lean: -0.1 },
      ],
    };
  }
  if (layout === 'hero-three') {
    const heroW = w * 0.62;
    const sideX = w * 0.645;
    const sideW = w * 0.335;
    const gap = h * 0.02;
    const sh = (h - 4 * gap) / 3;
    return {
      sky: false,
      panels: [
        { id: 'hero', name: 'Hero', x: 0, y: 0, w: heroW, h, tilt: 0, frame: 'none' },
        { id: 'side-0', name: 'Side 1', x: sideX, y: gap, w: sideW, h: sh, tilt: 0, frame: 'white' },
        { id: 'side-1', name: 'Side 2', x: sideX, y: gap * 2 + sh, w: sideW, h: sh, tilt: 0, frame: 'white' },
        { id: 'side-2', name: 'Side 3', x: sideX, y: gap * 3 + 2 * sh, w: sideW, h: sh, tilt: 0, frame: 'white' },
      ],
      title: { x: w * 0.04, y: h * 0.58, w: w * 0.56, h: h * 0.24, align: 'left' },
      subtitle: { x: w * 0.045, y: h * 0.83, w: w * 0.55, size: Math.round(min * 0.04), align: 'left' },
      badge: { x: w * 0.87, y: h * 0.025, scale: w / 1920 },
      sun: { x: w * 0.45, y: h * 0.16, r: min * 0.1 },
      palms: [{ x: w * 0.02, y: 0, s: h / 650, lean: 0.12, flip: true }],
    };
  }
  // hero: full-bleed hero photo, film strip of three panels along the bottom.
  const stripH = h * 0.24;
  const stripY = h * 0.72;
  const gap = Math.round(w * 0.012);
  const pw = (w - gap * 4) / 3;
  return {
    sky: false,
    filmBand: { x: 0, y: h * 0.70, w, h: h * 0.28 },
    panels: [
      { id: 'hero', name: 'Hero', x: 0, y: 0, w, h, tilt: 0, frame: 'none' },
      { id: 'strip-0', name: 'Strip 1', x: gap, y: stripY, w: pw, h: stripH, tilt: 0, frame: 'white' },
      { id: 'strip-1', name: 'Strip 2', x: gap * 2 + pw, y: stripY, w: pw, h: stripH, tilt: 0, frame: 'white' },
      { id: 'strip-2', name: 'Strip 3', x: gap * 3 + 2 * pw, y: stripY, w: pw, h: stripH, tilt: 0, frame: 'white' },
    ],
    title: { x: w * 0.045, y: h * 0.40, w: w * 0.62, h: h * 0.26, align: 'left' },
    subtitle: { x: w * 0.05, y: h * 0.665, w: w * 0.6, size: Math.round(min * 0.042), align: 'left' },
    badge: { x: w * 0.865, y: h * 0.035, scale: w / 1920 },
    sun: { x: w * 0.74, y: h * 0.19, r: min * 0.11 },
    palms: [
      { x: w * 0.02, y: 0, s: h / 620, lean: 0.12, flip: true },
      { x: w * 0.98, y: 0, s: h / 680, lean: -0.12, flip: true },
    ],
  };
}

/** The crop for a panel slot, created with a sensible default on first use. */
export function getCrop(state, panel, ordinal) {
  if (!state.crops[panel.id]) {
    const n = Math.max(1, state.photos.length);
    // Nine-panel grid cells (cell-0..cell-7) each get their own crop. The
    // shared cycle below repeats every 4 ordinals, which would give two
    // cells of the same photo identical crops; and its low centres (0.55,
    // 0.75) cut the head off a portrait photo in a square cell. These
    // centres stay high enough to keep the face in frame and differ per
    // cell, so no two cells show the same crop and none is headless.
    const NINE_CROPS = [
      { cx: 0.5, cy: 0.4 },
      { cx: 0.45, cy: 0.32 },
      { cx: 0.6, cy: 0.45 },
      { cx: 0.55, cy: 0.38 },
      { cx: 0.4, cy: 0.5 },
      { cx: 0.58, cy: 0.3 },
      { cx: 0.5, cy: 0.45 },
      { cx: 0.42, cy: 0.42 },
    ];
    const nine = panel.id.startsWith('cell-') ? NINE_CROPS[ordinal % NINE_CROPS.length] : null;
    state.crops[panel.id] = {
      photo: (state.photos[ordinal % n] || {}).id ?? null,
      cx: nine ? nine.cx : 0.5,
      cy: nine ? nine.cy : [0.3, 0.55, 0.75, 0.45][ordinal % 4],
      zoom: panel.id === 'hero' || panel.id === 'full' ? 1 : 1.25,
      rot: 0,
    };
  }
  const crop = state.crops[panel.id];
  if (!state.photos.some((p) => p.id === crop.photo)) crop.photo = state.photos[0]?.id ?? null;
  return crop;
}

function fitTitleLines(ctx, text, maxW, maxH, startSize) {
  const words = text.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], size: 0 };
  for (let size = startSize; size >= 20; size -= 4) {
    ctx.font = `400 ${size}px Anton, sans-serif`;
    const lines = [];
    let cur = '';
    for (const word of words) {
      const trial = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(trial).width <= maxW || !cur) cur = trial;
      else {
        lines.push(cur);
        cur = word;
      }
    }
    if (cur) lines.push(cur);
    if (lines.length > 3) continue;
    if (lines.length * size * 1.02 <= maxH) return { lines, size };
  }
  return { lines: words.slice(0, 3), size: 20 };
}

/** The big Anton title: auto-fit, outlined, glowing, optionally gradient-filled and halftone-faded. */
export function drawTitle(ctx, text, zone, opts) {
  const { lines, size } = fitTitleLines(ctx, text, zone.w, zone.h, Math.floor(zone.h));
  if (!lines.length) return;
  const pad = Math.ceil(size * 0.18);
  let target = null;
  let tctx = ctx;
  let ox = zone.x;
  let oy = zone.y;
  if (opts.halftone) {
    target = document.createElement('canvas');
    target.width = Math.ceil(zone.w + pad * 2);
    target.height = Math.ceil(zone.h + pad * 2);
    tctx = target.getContext('2d');
    ox = pad;
    oy = pad;
  }
  tctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    tctx.font = `400 ${size}px Anton, sans-serif`;
    const lineW = tctx.measureText(line).width;
    const lx = zone.align === 'center' ? ox + (zone.w - lineW) / 2 : ox;
    const ly = oy + i * size * 1.02;
    tctx.shadowColor = 'rgba(255, 45, 149, 0.75)';
    tctx.shadowBlur = size * 0.1;
    if (opts.gradient) {
      const g = tctx.createLinearGradient(lx, ly, lx + lineW, ly + size);
      g.addColorStop(0, '#ffb347');
      g.addColorStop(0.5, '#ff5da2');
      g.addColorStop(1, '#b537f2');
      tctx.fillStyle = g;
    } else {
      tctx.fillStyle = '#ffffff';
    }
    tctx.fillText(line, lx, ly);
    tctx.shadowBlur = 0;
    tctx.lineWidth = Math.max(2, size / 16);
    tctx.lineJoin = 'round';
    tctx.strokeStyle = 'rgba(16, 6, 28, 0.9)';
    tctx.strokeText(line, lx, ly);
  });
  if (target) {
    tctx.globalCompositeOperation = 'destination-out';
    const step = Math.max(7, size * 0.09);
    for (let y = pad + zone.h * 0.55; y < pad + zone.h; y += step) {
      const depth = (y - pad - zone.h * 0.55) / (zone.h * 0.45);
      const r = step * 0.5 * depth;
      for (let x = pad + ((y / step) % 2) * (step / 2); x < pad + zone.w; x += step) {
        tctx.beginPath();
        tctx.arc(x, y, r, 0, Math.PI * 2);
        tctx.fill();
      }
    }
    ctx.drawImage(target, zone.x - pad, zone.y - pad);
  }
}

/** The Pacifico neon subtitle, drawn twice for a stronger glow. */
export function drawSubtitle(ctx, text, zone) {
  const clean = text.trim();
  if (!clean) return;
  ctx.font = `400 ${zone.size}px Pacifico, cursive`;
  ctx.textBaseline = 'top';
  const w = ctx.measureText(clean).width;
  const x = zone.align === 'center' ? zone.x + (zone.w - w) / 2 : zone.x;
  ctx.fillStyle = '#ffd7ef';
  ctx.shadowColor = '#ff2d95';
  ctx.shadowBlur = zone.size * 0.5;
  ctx.fillText(clean, x, zone.y);
  ctx.shadowBlur = zone.size * 0.18;
  ctx.fillText(clean, x, zone.y);
  ctx.shadowBlur = 0;
}

/** The dark film band behind the hero layout's strip, with sprocket holes. */
function drawFilmBand(ctx, band) {
  ctx.fillStyle = '#0d0518';
  ctx.fillRect(band.x, band.y, band.w, band.h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  const holeW = Math.max(8, band.w * 0.012);
  const holeH = Math.max(6, band.h * 0.07);
  const step = holeW * 2.4;
  for (let x = band.x + holeW; x < band.x + band.w - holeW; x += step) {
    ctx.fillRect(x, band.y + 5, holeW, holeH);
    ctx.fillRect(x, band.y + band.h - 5 - holeH, holeW, holeH);
  }
}

function drawTape(ctx, panel) {
  const tw = panel.w * 0.22;
  const th = Math.max(10, panel.h * 0.05);
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.translate(panel.w * 0.16, 0);
  ctx.rotate(-0.35);
  ctx.fillRect(-tw / 2, -th / 2, tw, th);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.translate(panel.w * 0.84, 0);
  ctx.rotate(0.3);
  ctx.fillRect(-tw / 2, -th / 2, tw, th);
  ctx.restore();
}

function drawPanel(ctx, panel, photo, state, crop) {
  const src = photo ? rotatedSource(gradedSource(photo.img, state.grade), crop.rot) : null;
  const framed = panel.frame === 'white';
  const bw = framed ? Math.max(4, Math.round(Math.min(panel.w, panel.h) * 0.03)) : 0;
  ctx.save();
  if (panel.tilt) {
    ctx.save();
    ctx.translate(panel.x + panel.w / 2 + 10, panel.y + panel.h / 2 + 12);
    ctx.rotate((panel.tilt * Math.PI) / 180);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(-panel.w / 2 - bw, -panel.h / 2 - bw, panel.w + 2 * bw, panel.h + 2 * bw);
    ctx.restore();
    ctx.translate(panel.x + panel.w / 2, panel.y + panel.h / 2);
    ctx.rotate((panel.tilt * Math.PI) / 180);
    ctx.translate(-panel.w / 2, -panel.h / 2);
    if (framed) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-bw, -bw, panel.w + 2 * bw, panel.h + 2 * bw);
    }
    if (src) drawPhotoInto(ctx, src, { x: 0, y: 0, w: panel.w, h: panel.h }, crop);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, panel.w, panel.h);
    drawTape(ctx, panel);
  } else {
    if (framed) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(panel.x - bw, panel.y - bw, panel.w + 2 * bw, panel.h + 2 * bw);
    }
    if (src) drawPhotoInto(ctx, src, panel, crop);
    if (framed) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(panel.x, panel.y, panel.w, panel.h);
    }
  }
  ctx.restore();
}

/** Draws the whole cover onto a canvas at the canvas's own size. */
export function drawCover(canvas, state, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const plan = planLayout(state.layout, w, h);
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#160a24';
  ctx.fillRect(0, 0, w, h);
  if (plan.sky) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#2b1055');
    sky.addColorStop(0.45, '#c22e7a');
    sky.addColorStop(0.75, '#ff7a3d');
    sky.addColorStop(1, '#ffb347');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
  }
  plan.panels.forEach((panel, i) => {
    if (i === 1 && plan.filmBand) drawFilmBand(ctx, plan.filmBand);
    const crop = getCrop(state, panel, i);
    const photo = state.photos.find((p) => p.id === crop.photo) ?? state.photos[0] ?? null;
    drawPanel(ctx, panel, photo, state, crop);
  });
  if (plan.sun) drawSun(ctx, plan.sun.x, plan.sun.y, plan.sun.r);
  for (const palm of plan.palms || []) {
    drawPalm(ctx, palm.x, palm.y, palm.s, palm.lean || 0, !!palm.flip);
  }
  if (state.layout === 'single') {
    const shade = ctx.createLinearGradient(0, h * 0.5, 0, h);
    shade.addColorStop(0, 'rgba(10, 4, 20, 0)');
    shade.addColorStop(1, 'rgba(10, 4, 20, 0.6)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, h * 0.5, w, h * 0.5);
  }
  if (plan.titleCell) {
    ctx.fillStyle = '#1c0b2e';
    ctx.fillRect(plan.titleCell.x, plan.titleCell.y, plan.titleCell.w, plan.titleCell.h);
    ctx.strokeStyle = '#ff2d95';
    ctx.lineWidth = 3;
    ctx.strokeRect(plan.titleCell.x, plan.titleCell.y, plan.titleCell.w, plan.titleCell.h);
  }
  drawTitle(ctx, state.title, plan.title, { gradient: state.gradientTitle, halftone: state.halftoneTitle });
  drawSubtitle(ctx, state.subtitle, plan.subtitle);
  drawBadge(ctx, plan.badge.x, plan.badge.y, Math.max(0.45, plan.badge.scale * 1.25));
  if (state.grain) drawGrain(ctx, w, h);
  if (state.vignette) drawVignette(ctx, w, h);
  if (!opts.forExport && state.selected) {
    const sel = plan.panels.find((p) => p.id === state.selected);
    if (sel) {
      ctx.save();
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = '#4de8a8';
      ctx.lineWidth = 3;
      ctx.strokeRect(sel.x - 6, sel.y - 6, sel.w + 12, sel.h + 12);
      ctx.restore();
    }
  }
  ctx.restore();
  return plan;
}

/** Renders the cover at full export size on a fresh canvas. */
export function exportCover(state, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  drawCover(canvas, state, { forExport: true });
  return canvas;
}
