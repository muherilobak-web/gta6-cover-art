// Fixed scenes for screenshots: ?shot=editor shows the page with a sample
// photo; ?shot=cover shows the cover alone, drawn full-frame by the app's own
// render engine at the viewport's size. `photo` picks the sample
// (samples/<photo>.jpg), `caption` the title, `layout` and `grade` the look.
// window.__shotReady is set once the scene has painted.

import { drawCover, SIZES } from './cover.js';

function ready() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
  }));
}

function pickPhoto(state, name) {
  const photo = state.photos.find((p) => p.name === name);
  if (!photo) return;
  state.photos.sort((a, b) => (a.id === photo.id ? -1 : b.id === photo.id ? 1 : 0));
}

export async function runShot(shot, query, state, redraw) {
  const photo = query.get('photo') ?? 'pier';
  const caption = query.get('caption') ?? 'Neon Shore';
  const subtitle = query.get('subtitle') ?? 'Leonida nights';
  const layout = query.get('layout') ?? 'hero';
  const grade = query.get('grade') ?? 'sunset';
  const size = query.get('size') ?? '1920x1080';

  pickPhoto(state, photo);
  state.title = caption;
  state.subtitle = subtitle;
  state.layout = layout;
  state.grade = grade;
  state.crops = {};
  state.selected = null;

  const canvas = document.getElementById('cover');
  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    drawCover(canvas, state, { forExport: true });
    document.title = `Leonida Postcard — ${caption} (${size})`;
    ready();
    return;
  }
  // editor scene: the full editor with a photo loaded.
  const [w, h] = size.split('x').map(Number);
  if (w && h) {
    state.size = SIZES.find((s) => s.w === w && s.h === h) ?? state.size;
  }
  redraw();
  ready();
}
