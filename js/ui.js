const fontUrl = 'assets/textures/font/font.ttf';

import { getBlockDefs, getBlockIconPath } from './textures.js';

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
  ['Tab', 'Toggle menu'],
];

let fpsEl;
let menuEl;
let canvas;
let hotbarEl;
let selectedSlot = 0;
const slots = [];
const slotBlocks = [];

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

  const crosshair = document.createElement('img');
  crosshair.id = 'crosshair';
  crosshair.src = 'assets/textures/ui/crosshair.png';
  crosshair.alt = '';
  document.body.appendChild(crosshair);

  buildHotbar();
  buildMenu();

  document.addEventListener('keydown', e => {
    if (e.code === 'Tab') {
      e.preventDefault();
      toggleMenu();
      return;
    }
    const n = e.key;
    if (n >= '1' && n <= '9') selectSlot(Number(n) - 1);
  });

  document.addEventListener('wheel', e => {
    e.preventDefault();
    selectSlot(selectedSlot + (e.deltaY > 0 ? 1 : -1));
  });
}

function buildHotbar() {
  hotbarEl = document.createElement('div');
  hotbarEl.id = 'hotbar';
  for (let i = 0; i < 9; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'hotbar-slot';
    const slot = document.createElement('img');
    slot.src = 'assets/textures/ui/hotbarslot.png';
    slot.alt = '';
    const icon = document.createElement('img');
    icon.className = 'hotbar-icon';
    icon.alt = '';
    const selected = document.createElement('img');
    selected.className = 'hotbar-selected';
    selected.src = 'assets/textures/ui/selected.png';
    selected.alt = '';
    wrap.appendChild(slot);
    wrap.appendChild(icon);
    wrap.appendChild(selected);
    hotbarEl.appendChild(wrap);
    slots.push(wrap);
  }
  document.body.appendChild(hotbarEl);
  selectSlot(0);
}

export function refreshHotbar() {
  const defs = getBlockDefs().filter(d => !d.unbreakable);
  slots.forEach((wrap, i) => {
    const icon = wrap.querySelector('.hotbar-icon');
    const def = defs[i];
    slotBlocks[i] = def ? def.id : null;
    wrap.classList.toggle('filled', Boolean(def));
    if (def) {
      icon.src = getBlockIconPath(def.id) || '';
    } else {
      icon.src = '';
    }
  });
}

function selectSlot(i) {
  selectedSlot = ((i % 9) + 9) % 9;
  slots.forEach((wrap, idx) => wrap.classList.toggle('active', idx === selectedSlot));
}

export function getSelectedSlot() {
  return selectedSlot;
}

export function getSelectedBlockId() {
  return slotBlocks[selectedSlot] || null;
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
