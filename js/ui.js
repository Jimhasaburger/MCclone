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
  ['Tab', 'Toggle menu'],
];

let fpsEl;
let menuEl;
let canvas;

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

  buildMenu();

  document.addEventListener('keydown', e => {
    if (e.code === 'Tab') {
      e.preventDefault();
      toggleMenu();
    }
  });
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

export function hideLoading() {
  const loading = document.getElementById('loading');
  if (loading) loading.remove();
}
