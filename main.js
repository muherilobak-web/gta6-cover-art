// Leonida Postcard — the editor.
// Wires the page: photo tray, layout and grade pickers, caption fields,
// per-panel crop controls, size picker, PNG export, undo/redo and shuffle.
// A `?shot=` query sets up a fixed scene for a screenshot instead (shots.js).

import { drawCover, exportCover, planLayout, getCrop, cropRange, LAYOUTS, GRADES, SIZES, DEFAULT_TITLES } from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const status = document.getElementById('status');
const tray = document.getElementById('tray');
const panelName = document.getElementById('panelName');
const panelPhoto = document.getElementById('panelPhoto');
const panelZoom = document.getElementById('panelZoom');

const photoRegistry = new Map();
let photoSeq = 0;

export const state = {
  photos: [],
  layout: 'hero',
  grade: 'sunset',
  title: 'Neon Shore',
  subtitle: 'Leonida nights',
  size: SIZES[2],
  grain: true,
  vignette: true,
  gradientTitle: true,
  halftoneTitle: false,
  crops: {},
  selected: 'hero',
};

function say(msg) {
  status.textContent = msg;
}

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`cannot load ${url}`));
    img.src = url;
  });
}

async function registerPhoto(name, src) {
  const img = await loadImage(src);
  const id = `p${++photoSeq}`;
  const photo = { id, name, src, img };
  photoRegistry.set(id, photo);
  state.photos.push(photo);
  return photo;
}

function redraw() {
  fitPreview();
  drawCover(canvas, state);
  syncPanelControls();
}

/** Sizes the preview canvas to the chosen export size's aspect, longest side 900. */
function fitPreview() {
  const { w, h } = state.size;
  const scale = 900 / Math.max(w, h);
  const dw = Math.max(2, Math.round(w * scale));
  const dh = Math.max(2, Math.round(h * scale));
  if (canvas.width !== dw || canvas.height !== dh) {
    canvas.width = dw;
    canvas.height = dh;
  }
}

function renderTray() {
  tray.innerHTML = '';
  if (!state.photos.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No photos yet.';
    tray.appendChild(p);
    return;
  }
  const selectedPhoto = selectedCrop()?.photo ?? null;
  for (const photo of state.photos) {
    const thumb = document.createElement('img');
    thumb.src = photo.src;
    thumb.alt = photo.name;
    thumb.title = `${photo.name} — click to use in the selected panel`;
    if (photo.id === selectedPhoto) thumb.classList.add('picked');
    thumb.addEventListener('click', () => {
      const crop = selectedCrop();
      if (!crop) return;
      pushHistory();
      crop.photo = photo.id;
      redraw();
    });
    tray.appendChild(thumb);
  }
}

function currentPlan() {
  return planLayout(state.layout, canvas.width, canvas.height);
}

function selectedCrop() {
  if (!state.selected) return null;
  const plan = currentPlan();
  const panel = plan.panels.find((p) => p.id === state.selected);
  if (!panel) return null;
  return getCrop(state, panel, plan.panels.indexOf(panel));
}

function syncPanelControls() {
  renderTray();
  const plan = currentPlan();
  const panel = plan.panels.find((p) => p.id === state.selected);
  if (!panel) {
    panelName.textContent = 'Click a panel on the cover';
    panelPhoto.innerHTML = '';
    panelZoom.value = '1';
    panelZoom.disabled = true;
    return;
  }
  panelName.textContent = `${panel.name} — drag to pan, scroll to zoom`;
  panelZoom.disabled = false;
  const crop = getCrop(state, panel, plan.panels.indexOf(panel));
  panelPhoto.innerHTML = '';
  for (const photo of state.photos) {
    const opt = document.createElement('option');
    opt.value = photo.id;
    opt.textContent = photo.name;
    if (photo.id === crop.photo) opt.selected = true;
    panelPhoto.appendChild(opt);
  }
  panelZoom.value = String(crop.zoom);
}

// --- history (undo / redo) -----------------------------------------------

const undoStack = [];
const redoStack = [];

function snapshot() {
  return JSON.stringify({
    layout: state.layout,
    grade: state.grade,
    title: state.title,
    subtitle: state.subtitle,
    sizeId: state.size.id,
    grain: state.grain,
    vignette: state.vignette,
    gradientTitle: state.gradientTitle,
    halftoneTitle: state.halftoneTitle,
    crops: state.crops,
    selected: state.selected,
    photos: state.photos.map((p) => ({ id: p.id, name: p.name, src: p.src })),
  });
}

function pushHistory() {
  undoStack.push(snapshot());
  if (undoStack.length > 50) undoStack.shift();
  redoStack.length = 0;
  syncHistoryButtons();
}

async function applySnapshot(json) {
  const snap = JSON.parse(json);
  state.layout = snap.layout;
  state.grade = snap.grade;
  state.title = snap.title;
  state.subtitle = snap.subtitle;
  state.size = SIZES.find((s) => s.id === snap.sizeId) ?? SIZES[2];
  state.grain = snap.grain;
  state.vignette = snap.vignette;
  state.gradientTitle = snap.gradientTitle;
  state.halftoneTitle = snap.halftoneTitle;
  state.crops = snap.crops;
  state.selected = snap.selected;
  state.photos = [];
  for (const meta of snap.photos) {
    let photo = photoRegistry.get(meta.id);
    if (!photo) {
      const img = await loadImage(meta.src);
      photo = { id: meta.id, name: meta.name, src: meta.src, img };
      photoRegistry.set(meta.id, photo);
    }
    state.photos.push(photo);
  }
  syncControls();
  redraw();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  applySnapshot(undoStack.pop());
  syncHistoryButtons();
  say('Undid the last change.');
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  applySnapshot(redoStack.pop());
  syncHistoryButtons();
  say('Redid the change.');
}

function syncHistoryButtons() {
  document.getElementById('undo').disabled = undoStack.length === 0;
  document.getElementById('redo').disabled = redoStack.length === 0;
}

// --- controls ------------------------------------------------------------

function buildPickers() {
  const layouts = document.getElementById('layouts');
  for (const [id, def] of Object.entries(LAYOUTS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = def.name;
    b.dataset.layout = id;
    b.addEventListener('click', () => {
      if (state.layout === id) return;
      pushHistory();
      state.layout = id;
      const plan = currentPlan();
      state.selected = plan.panels[0].id;
      syncControls();
      redraw();
    });
    layouts.appendChild(b);
  }
  const grades = document.getElementById('grades');
  for (const [id, def] of Object.entries(GRADES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.dataset.grade = id;
    const chip = document.createElement('i');
    chip.style.background = gradeChip(id);
    b.appendChild(chip);
    b.appendChild(document.createTextNode(def.name));
    b.addEventListener('click', () => {
      if (state.grade === id) return;
      pushHistory();
      state.grade = id;
      syncControls();
      redraw();
    });
    grades.appendChild(b);
  }
  const sizes = document.getElementById('sizes');
  for (const size of SIZES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = size.name;
    b.dataset.size = size.id;
    b.addEventListener('click', () => {
      if (state.size.id === size.id) return;
      pushHistory();
      state.size = size;
      syncControls();
      redraw();
    });
    sizes.appendChild(b);
  }
}

function gradeChip(id) {
  return {
    sunset: 'linear-gradient(135deg,#ff7a3d,#ff2d95 55%,#7b2ff7)',
    neon: 'linear-gradient(135deg,#0a0a2e,#ff2d95 55%,#4de8e8)',
    golden: 'linear-gradient(135deg,#2e1a0b,#e8a33d 60%,#ffe9a8)',
    duotone: 'linear-gradient(135deg,#12041f,#ff5da2)',
    noir: 'linear-gradient(135deg,#111,#888)',
    original: 'linear-gradient(135deg,#2b6cb0,#63b3ed)',
  }[id];
}

function syncControls() {
  document.querySelectorAll('#layouts button').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === state.layout);
  });
  document.querySelectorAll('#grades button').forEach((b) => {
    b.classList.toggle('active', b.dataset.grade === state.grade);
  });
  document.querySelectorAll('#sizes button').forEach((b) => {
    b.classList.toggle('active', b.dataset.size === state.size.id);
  });
  document.getElementById('title').value = state.title;
  document.getElementById('subtitle').value = state.subtitle;
  document.getElementById('grain').checked = state.grain;
  document.getElementById('vignette').checked = state.vignette;
  document.getElementById('gradientTitle').checked = state.gradientTitle;
  document.getElementById('halftoneTitle').checked = state.halftoneTitle;
}

function bindControls() {
  const titleInput = document.getElementById('title');
  const subtitleInput = document.getElementById('subtitle');
  titleInput.addEventListener('focus', () => pushHistory());
  subtitleInput.addEventListener('focus', () => pushHistory());
  titleInput.addEventListener('input', () => {
    state.title = titleInput.value;
    redraw();
  });
  subtitleInput.addEventListener('input', () => {
    state.subtitle = subtitleInput.value;
    redraw();
  });
  document.getElementById('gradientTitle').addEventListener('change', (e) => {
    pushHistory();
    state.gradientTitle = e.target.checked;
    redraw();
  });
  document.getElementById('halftoneTitle').addEventListener('change', (e) => {
    pushHistory();
    state.halftoneTitle = e.target.checked;
    redraw();
  });
  document.getElementById('grain').addEventListener('change', (e) => {
    pushHistory();
    state.grain = e.target.checked;
    redraw();
  });
  document.getElementById('vignette').addEventListener('change', (e) => {
    pushHistory();
    state.vignette = e.target.checked;
    redraw();
  });
  panelPhoto.addEventListener('change', () => {
    const crop = selectedCrop();
    if (!crop) return;
    pushHistory();
    crop.photo = panelPhoto.value;
    redraw();
  });
  panelZoom.addEventListener('focus', () => pushHistory());
  panelZoom.addEventListener('input', () => {
    const crop = selectedCrop();
    if (!crop) return;
    crop.zoom = Number(panelZoom.value);
    redraw();
  });
  document.getElementById('panelRotate').addEventListener('click', () => {
    const crop = selectedCrop();
    if (!crop) return;
    pushHistory();
    crop.rot = (crop.rot + 90) % 360;
    redraw();
  });
  document.getElementById('undo').addEventListener('click', undo);
  document.getElementById('redo').addEventListener('click', redo);
  document.getElementById('shuffle').addEventListener('click', () => {
    pushHistory();
    const layouts = Object.keys(LAYOUTS).filter((l) => l !== state.layout);
    state.layout = layouts[Math.floor(Math.random() * layouts.length)];
    const grades = Object.keys(GRADES).filter((g) => g !== state.grade);
    state.grade = grades[Math.floor(Math.random() * grades.length)];
    const titles = DEFAULT_TITLES.filter((t) => t !== state.title);
    state.title = titles[Math.floor(Math.random() * titles.length)];
    const plan = currentPlan();
    state.selected = plan.panels[0].id;
    syncControls();
    redraw();
    say(`Shuffled: ${LAYOUTS[state.layout].name}, ${GRADES[state.grade].name}, “${state.title}”.`);
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    }
  });
}

// --- photo input ---------------------------------------------------------

async function addFiles(files) {
  let added = 0;
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    try {
      await registerPhoto(file.name.replace(/\.[^.]+$/, ''), url);
      added++;
    } catch {
      URL.revokeObjectURL(url);
    }
  }
  if (added) {
    pushHistory();
    redraw();
    say(`Added ${added} photo${added > 1 ? 's' : ''}.`);
  }
}

function bindPhotoInput() {
  document.getElementById('upload').addEventListener('change', (e) => {
    addFiles([...e.target.files]);
    e.target.value = '';
  });
  tray.addEventListener('dragover', (e) => e.preventDefault());
  tray.addEventListener('drop', (e) => {
    e.preventDefault();
    addFiles([...e.dataTransfer.files]);
  });
}

// --- canvas interaction: select, pan, zoom -------------------------------

function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * canvas.width,
    y: ((e.clientY - r.top) / r.height) * canvas.height,
  };
}

function panelAt(point) {
  const plan = currentPlan();
  for (let i = plan.panels.length - 1; i >= 0; i--) {
    const p = plan.panels[i];
    if (point.x >= p.x && point.x <= p.x + p.w && point.y >= p.y && point.y <= p.y + p.h) return p;
  }
  return null;
}

function bindCanvas() {
  let dragging = null;
  let wheelBurst = 0;

  canvas.addEventListener('pointerdown', (e) => {
    const point = canvasPoint(e);
    const panel = panelAt(point);
    if (!panel) return;
    pushHistory();
    state.selected = panel.id;
    const crop = getCrop(state, panel, currentPlan().panels.indexOf(panel));
    dragging = { panel, crop, last: point };
    canvas.setPointerCapture(e.pointerId);
    syncPanelControls();
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const point = canvasPoint(e);
    const { panel, crop, last } = dragging;
    const photo = state.photos.find((p) => p.id === crop.photo) ?? state.photos[0];
    if (!photo) return;
    const iw = photo.img.naturalWidth;
    const ih = photo.img.naturalHeight;
    const scale = Math.max(panel.w / iw, panel.h / ih) * crop.zoom;
    const dw = iw * scale;
    const dh = ih * scale;
    const range = cropRange(panel, iw, ih, crop.zoom);
    crop.cx = Math.max(range.cxMin, Math.min(range.cxMax, crop.cx - (point.x - last.x) / dw));
    crop.cy = Math.max(range.cyMin, Math.min(range.cyMax, crop.cy - (point.y - last.y) / dh));
    dragging.last = point;
    redraw();
  });
  canvas.addEventListener('pointerup', () => {
    dragging = null;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const point = canvasPoint(e);
    const panel = panelAt(point);
    if (!panel) return;
    const now = Date.now();
    if (now - wheelBurst > 600) {
      pushHistory();
      wheelBurst = now;
    }
    const crop = getCrop(state, panel, currentPlan().panels.indexOf(panel));
    state.selected = panel.id;
    crop.zoom = Math.max(1, Math.min(3, crop.zoom * Math.exp(-e.deltaY * 0.0012)));
    syncPanelControls();
    redraw();
  }, { passive: false });
}

// --- export --------------------------------------------------------------

function slug(text) {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cover';
}

function downloadCanvas(coverCanvas, name) {
  return new Promise((resolve) => {
    coverCanvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      resolve(blob);
    }, 'image/png');
  });
}

export async function exportPng(size) {
  const coverCanvas = exportCover(state, size.w, size.h);
  const name = `leonida-${slug(state.title)}-${size.w}x${size.h}.png`;
  const blob = await downloadCanvas(coverCanvas, name);
  say(`Saved ${name} (${size.w} × ${size.h}).`);
  return { name, blob, width: size.w, height: size.h };
}

function bindExport() {
  document.getElementById('export').addEventListener('click', () => exportPng(state.size));
  document.getElementById('exportAll').addEventListener('click', async () => {
    const three = SIZES.slice(0, 3);
    for (const size of three) {
      await exportPng(size);
      await new Promise((r) => setTimeout(r, 250));
    }
    say(`Saved ${three.length} PNGs — one per post size.`);
  });
}

// --- boot ----------------------------------------------------------------

async function boot() {
  buildPickers();
  bindControls();
  bindPhotoInput();
  bindCanvas();
  bindExport();
  syncControls();
  syncHistoryButtons();
  try {
    await Promise.all([
      document.fonts.load('400 40px Anton'),
      document.fonts.load('400 40px Pacifico'),
      document.fonts.ready,
    ]);
  } catch {
    // The cover still draws with fallback fonts.
  }
  await registerPhoto('boulevard', 'samples/boulevard.jpg');
  await registerPhoto('pier', 'samples/pier.jpg');
  const shot = new URLSearchParams(location.search).get('shot');
  if (shot) {
    await runShot(shot, new URLSearchParams(location.search), state, redraw);
  } else {
    redraw();
  }
}

// A small handle for the app's own screenshot scenes and for testing.
window.__leonida = { state, exportPng, redraw };

boot();
