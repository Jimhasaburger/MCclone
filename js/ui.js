const fontUrl = 'assets/textures/font/font.ttf';

const keybinds = [
  ['W A S D', 'Move'],
  ['Space', 'Jump'],
  ['Shift', 'Sprint'],
  ['Left Click', 'Break block'],
  ['Right Click', 'Place block'],
  ['G', 'Export world (zip)'],
  ['I', 'Import world (zip)'],
  ['R', 'Regenerate world (new seed)'],
  ['1-9 / Scroll', 'Select hotbar slot'],
  ['E', 'Open inventory'],
  ['M', 'Toggle music'],
  ['Tab', 'Toggle menu'],
];

let fpsEl;
let menuEl;
let canvas;
let labelEl;
let labelTimer = null;
let coordsEl;
let songEl;
let versionEl;

export function initUI(canvasRef) {
  canvas = canvasRef;

  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: 'GameFont';
      src: url('${fontUrl}') format('truetype');
    }
  `;
  document.head.appendChild(style);

  fpsEl = document.getElementById('fps');
  if (fpsEl) fpsEl.style.fontFamily = "'GameFont', sans-serif";

  coordsEl = document.getElementById('coords');
  if (coordsEl) coordsEl.style.fontFamily = "'GameFont', sans-serif";

  songEl = document.getElementById('song');
  if (songEl) songEl.style.fontFamily = "'GameFont', sans-serif";

  versionEl = document.getElementById('version');
  if (versionEl) versionEl.style.fontFamily = "'GameFont', sans-serif";

  const crosshair = document.createElement('img');
  crosshair.id = 'crosshair';
  crosshair.src = 'assets/textures/ui/crosshair.png';
  crosshair.alt = '';
  document.body.appendChild(crosshair);

  labelEl = document.createElement('div');
  labelEl.id = 'hotbar-label';
  document.body.appendChild(labelEl);

  buildMenu();

  document.addEventListener('keydown', e => {
    if (e.code === 'Tab') {
      e.preventDefault();
      toggleMenu();
    }
  });
}

export function showText(text, color = '#ffffff') {
  if (!labelEl) return;
  clearTimeout(labelTimer);
  if (!text) {
    labelEl.style.opacity = 0;
    return;
  }
  labelEl.textContent = text;
  labelEl.style.color = color;
  labelEl.style.opacity = 1;
  labelTimer = setTimeout(() => {
    labelEl.style.opacity = 0;
  }, 1600);
}

function buildMenu() {
  menuEl = document.createElement('div');
  menuEl.id = 'menu';
  menuEl.style.display = 'none';

  const title = document.createElement('h1');
  title.textContent = 'Keybinds';
  menuEl.appendChild(title);

  const list = document.createElement('div');
  list.className = 'menu-list';
  for (const [key, desc] of keybinds) {
    const row = document.createElement('div');
    row.className = 'menu-row';
    const k = document.createElement('span');
    k.className = 'menu-key';
    k.textContent = key;
    const d = document.createElement('span');
    d.textContent = desc;
    row.appendChild(k);
    row.appendChild(d);
    list.appendChild(row);
  }
  menuEl.appendChild(list);
  document.body.appendChild(menuEl);
}

export function toggleMenu() {
  if (!menuEl) return;
  const open = menuEl.style.display !== 'none';
  if (open) {
    menuEl.style.display = 'none';
    if (canvas) canvas.requestPointerLock();
  } else {
    menuEl.style.display = 'block';
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

export function setFPS(fps) {
  if (fpsEl) fpsEl.textContent = `FPS: ${fps}`;
}

export function setCoords(x, y, z) {
  if (coordsEl) coordsEl.textContent = `X: ${Math.floor(x)}  Y: ${Math.floor(y)}  Z: ${Math.floor(z)}`;
}

export function setVersion(text) {
  if (versionEl) versionEl.textContent = text;
}

export function setSong(text) {
  if (!songEl) return;
  songEl.textContent = text;
}

export function hideLoading() {
  const loading = document.getElementById('loading');
  if (loading) loading.remove();
}
