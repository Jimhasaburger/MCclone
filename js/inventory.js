import { getBlockDefs, getBlockIconPath, isUnbreakable } from './textures.js';
import {
  getSelectedSlot,
  setSelectedSlot,
  setHotbarSlot,
  getHotbarSlotIds,
  setInventoryOpenCallback,
  setOnSelectChange,
} from './hotbar.js';
import { showText } from './ui.js';
import { DATA_VERSION } from './config.js';

const BG_SRC = `assets/textures/ui/inventory/tab_items.png?v=${DATA_VERSION}`;
const SCROLL_SRC = `assets/textures/ui/inventory/scrollbars.png?v=${DATA_VERSION}`;

const SCALE = 2;
const COLS = 9;
const ROWS = 6;
const VISIBLE = COLS * ROWS;
const SLOT_SIZE = 16;
const SPACING = 18;
const GRID_LEFT = 8;
const GRID_TOP = 18;
const TRACK_LEFT = 175;
const TRACK_TOP = 13;
const TRACK_HEIGHT = 116;
const THUMB_WIDTH = 12;
const THUMB_HEIGHT = 15;
const HOTBAR_TOP = 148;

let menuEl;
let trackEl;
let thumbEl;
let gridSlots = [];
let hotbarSlotEls = [];
let items = [];
let rowOffset = 0;
let maxRowOffset = 0;
let open = false;
let dragging = false;
let domElement;

export function initInventory(canvasRef) {
  domElement = canvasRef;
  buildMenu();
  setInventoryOpenCallback(() => open);
  setOnSelectChange(() => {
    if (open) renderHotbar();
  });

  document.addEventListener('keydown', e => {
    if (e.code === 'KeyE') {
      e.preventDefault();
      toggle();
    } else if (e.code === 'Escape' && open) {
      close();
    }
  });

  document.addEventListener(
    'wheel',
    e => {
      if (!open) return;
      e.preventDefault();
      scrollByRows(e.deltaY > 0 ? 1 : -1);
    },
    { passive: false }
  );
}

function buildMenu() {
  menuEl = document.createElement('div');
  menuEl.id = 'inventory';
  menuEl.style.display = 'none';
  const windowW = 256 * SCALE;
  const windowH = HOTBAR_TOP * SCALE + SLOT_SIZE * SCALE + 12;
  menuEl.style.width = `${windowW}px`;
  menuEl.style.height = `${windowH}px`;

  const bg = document.createElement('img');
  bg.className = 'inv-bg';
  bg.src = BG_SRC;
  menuEl.appendChild(bg);

  const grid = document.createElement('div');
  grid.className = 'inv-grid';
  grid.style.left = `${GRID_LEFT * SCALE}px`;
  grid.style.top = `${GRID_TOP * SCALE}px`;
  for (let i = 0; i < VISIBLE; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const el = document.createElement('div');
    el.className = 'inv-item-slot';
    el.style.left = `${col * SPACING * SCALE}px`;
    el.style.top = `${row * SPACING * SCALE}px`;
    el.style.width = `${SLOT_SIZE * SCALE}px`;
    el.style.height = `${SLOT_SIZE * SCALE}px`;
    const icon = document.createElement('img');
    icon.className = 'inv-item-icon';
    el.appendChild(icon);
    el.addEventListener('click', () => onItemClick(i));
    grid.appendChild(el);
    gridSlots.push({ el, icon });
  }
  menuEl.appendChild(grid);

  trackEl = document.createElement('div');
  trackEl.className = 'inv-scrollbar';
  trackEl.style.left = `${TRACK_LEFT * SCALE}px`;
  trackEl.style.top = `${TRACK_TOP * SCALE}px`;
  trackEl.style.width = `${THUMB_WIDTH * SCALE}px`;
  trackEl.style.height = `${TRACK_HEIGHT * SCALE}px`;
  thumbEl = document.createElement('div');
  thumbEl.className = 'inv-scroll-thumb';
  thumbEl.addEventListener('mousedown', onThumbDown);
  trackEl.appendChild(thumbEl);
  menuEl.appendChild(trackEl);

  const hotbar = document.createElement('div');
  hotbar.className = 'inv-hotbar';
  hotbar.style.left = `${GRID_LEFT * SCALE}px`;
  hotbar.style.top = `${HOTBAR_TOP * SCALE}px`;
  for (let i = 0; i < 9; i++) {
    const el = document.createElement('div');
    el.className = 'inv-hotbar-slot';
    el.style.left = `${i * SPACING * SCALE}px`;
    el.style.width = `${SLOT_SIZE * SCALE}px`;
    el.style.height = `${SLOT_SIZE * SCALE}px`;
    const bgImg = document.createElement('img');
    bgImg.className = 'inv-hotbar-bg';
    bgImg.src = 'assets/textures/ui/hotbarslot.png';
    const selected = document.createElement('img');
    selected.className = 'inv-hotbar-selected';
    selected.src = 'assets/textures/ui/selected.png';
    const icon = document.createElement('img');
    icon.className = 'inv-hotbar-icon';
    el.appendChild(bgImg);
    el.appendChild(icon);
    el.appendChild(selected);
    el.addEventListener('click', () => setSelectedSlot(i));
    hotbar.appendChild(el);
    hotbarSlotEls.push({ el, icon });
  }
  menuEl.appendChild(hotbar);

  document.body.appendChild(menuEl);
}

function refreshItems() {
  const defs = getBlockDefs().filter(d => !isUnbreakable(d.id));
  items = defs.map(d => ({
    id: d.id,
    name: displayName(d),
    icon: getBlockIconPath(d.id) || '',
  }));
  maxRowOffset = Math.max(0, Math.ceil(items.length / COLS) - ROWS);
  rowOffset = Math.min(rowOffset, maxRowOffset);
}

function displayName(def) {
  if (!def || !def.name) return '';
  return def.name
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function onItemClick(i) {
  const idx = rowOffset * COLS + i;
  const item = items[idx];
  if (!item) return;
  setHotbarSlot(getSelectedSlot(), item.id);
  showText(item.name);
  renderHotbar();
}

function renderScroll() {
  const start = rowOffset * COLS;
  gridSlots.forEach((s, i) => {
    const idx = start + i;
    const item = idx < items.length ? items[idx] : null;
    s.icon.src = item ? item.icon : '';
    s.el.classList.toggle('empty', !item);
  });
  const offs = maxRowOffset > 0 ? rowOffset / maxRowOffset : 0;
  const maxTop = TRACK_HEIGHT - THUMB_HEIGHT;
  thumbEl.style.top = `${Math.round(offs * maxTop) * SCALE}px`;
  thumbEl.style.backgroundPosition = dragging ? '0px 0px' : `-${THUMB_WIDTH * SCALE}px 0px`;
}

function renderHotbar() {
  const ids = getHotbarSlotIds();
  const defs = getBlockDefs();
  const map = new Map(defs.map(d => [d.id, d]));
  const sel = getSelectedSlot();
  hotbarSlotEls.forEach((s, i) => {
    const def = map.get(ids[i]);
    s.icon.src = def ? getBlockIconPath(def.id) || '' : '';
    s.el.classList.toggle('active', i === sel);
    s.el.classList.toggle('empty', !def);
  });
}

function scrollByRows(dir) {
  rowOffset = Math.max(0, Math.min(maxRowOffset, rowOffset + dir));
  renderScroll();
}

function setRowFromRatio(rel) {
  rowOffset = Math.round(Math.max(0, Math.min(1, rel)) * maxRowOffset);
  renderScroll();
}

function onThumbDown(e) {
  if (maxRowOffset <= 0) return;
  dragging = true;
  const rect = trackEl.getBoundingClientRect();
  const maxTop = rect.height - THUMB_HEIGHT * SCALE;
  const rel = (e.clientY - rect.top - (THUMB_HEIGHT * SCALE) / 2) / maxTop;
  setRowFromRatio(rel);
  document.addEventListener('mousemove', onThumbMove);
  document.addEventListener('mouseup', onThumbUp);
  e.preventDefault();
}

function onThumbMove(e) {
  if (!dragging) return;
  const rect = trackEl.getBoundingClientRect();
  const maxTop = rect.height - THUMB_HEIGHT * SCALE;
  const rel = (e.clientY - rect.top - (THUMB_HEIGHT * SCALE) / 2) / maxTop;
  setRowFromRatio(rel);
}

function onThumbUp() {
  dragging = false;
  document.removeEventListener('mousemove', onThumbMove);
  document.removeEventListener('mouseup', onThumbUp);
  renderScroll();
}

function openMenu() {
  refreshItems();
  open = true;
  menuEl.style.display = 'block';
  if (document.pointerLockElement) document.exitPointerLock();
  renderScroll();
  renderHotbar();
}

function close() {
  open = false;
  menuEl.style.display = 'none';
  if (domElement) domElement.requestPointerLock();
}

function toggle() {
  if (open) close();
  else openMenu();
}

export function isInventoryOpen() {
  return open;
}
