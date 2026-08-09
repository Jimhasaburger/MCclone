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
const ROWS = 5;
const VISIBLE = COLS * ROWS;
const SLOT_SIZE = 16;
const SPACING = 18;

const WINDOW_WIDTH = 195;
const WINDOW_HEIGHT = 136;

const GRID_LEFT = 9;
const GRID_TOP = 18;
const TRACK_LEFT = 175;
const TRACK_TOP = 18;
const TRACK_HEIGHT = 108;
const THUMB_WIDTH = 12;
const THUMB_HEIGHT = 15;
const HOTBAR_TOP = 112;

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
let dragItem = null;
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
  
  const windowW = WINDOW_WIDTH * SCALE;
  const windowH = WINDOW_HEIGHT * SCALE;
  menuEl.style.width = `${windowW}px`;
  menuEl.style.height = `${windowH}px`;

  const bg = document.createElement('img');
  bg.className = 'inv-bg';
  bg.src = BG_SRC;
  bg.style.width = '100%';
  bg.style.height = '100%';
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

    el.addEventListener('mousedown', (e) => {
      startDrag(i, e);
      e.preventDefault();
    });

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
  trackEl.addEventListener('mousedown', onTrackClick);
  
  thumbEl = document.createElement('div');
  thumbEl.className = 'inv-scroll-thumb';
  thumbEl.style.width = `${THUMB_WIDTH * SCALE}px`;
  thumbEl.style.height = `${THUMB_HEIGHT * SCALE}px`;
  thumbEl.style.backgroundImage = `url(${SCROLL_SRC})`;
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
    el.dataset.index = String(i);
    el.style.left = `${i * SPACING * SCALE}px`;
    el.style.width = `${SLOT_SIZE * SCALE}px`;
    el.style.height = `${SLOT_SIZE * SCALE}px`;

    const icon = document.createElement('img');
    icon.className = 'inv-hotbar-icon';

    el.appendChild(icon);
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

function startDrag(i, e) {
  const idx = rowOffset * COLS + i;
  const item = items[idx];
  if (!item) return;
  dragItem = { id: item.id, name: item.name, icon: item.icon };
  const ghost = document.createElement('img');
  ghost.className = 'inv-drag-icon';
  ghost.src = item.icon;
  document.body.appendChild(ghost);
  dragItem.el = ghost;
  showText(item.name);
  updateDrag(e);
  document.addEventListener('mousemove', updateDrag);
  document.addEventListener('mouseup', endDrag);
}

function updateDrag(e) {
  if (!dragItem || !dragItem.el) return;
  dragItem.el.style.left = `${e.clientX}px`;
  dragItem.el.style.top = `${e.clientY}px`;
}

function endDrag(e) {
  document.removeEventListener('mousemove', updateDrag);
  document.removeEventListener('mouseup', endDrag);
  if (!dragItem) return;
  const item = dragItem;
  const el = dragItem.el;
  dragItem = null;
  dropItem(e, item, el);
}

function dropItem(e, item, el) {
  const target = document.elementFromPoint(e.clientX, e.clientY);
  const slotEl = target && target.closest('.inv-hotbar-slot');
  if (slotEl) {
    setHotbarSlot(Number(slotEl.dataset.index), item.id);
  } else {
    const idx = hotbarIndexAt(e.clientX, e.clientY);
    if (idx !== -1) setHotbarSlot(idx, item.id);
  }
  if (el) el.remove();
  renderHotbar();
}

function hotbarIndexAt(x, y) {
  const slots = menuEl.querySelectorAll('.inv-hotbar-slot');
  if (!slots.length) return -1;
  const first = slots[0].getBoundingClientRect();
  const last = slots[slots.length - 1].getBoundingClientRect();
  if (y < first.top - 6 || y > first.bottom + 6 || x < first.left || x > last.right) return -1;
  const perSlot = (last.right - first.left) / slots.length;
  return Math.min(slots.length - 1, Math.max(0, Math.floor((x - first.left) / perSlot)));
}

function cancelDrag() {
  if (!dragItem) return;
  if (dragItem.el) dragItem.el.remove();
  document.removeEventListener('mousemove', updateDrag);
  document.removeEventListener('mouseup', endDrag);
  dragItem = null;
}

function renderScroll() {
  const start = rowOffset * COLS;
  gridSlots.forEach((s, i) => {
    const idx = start + i;
    const item = idx < items.length ? items[idx] : null;
    s.icon.src = item ? item.icon : '';
    s.el.classList.toggle('empty', !item);
  });

  const totalRows = Math.max(1, Math.ceil(items.length / COLS));
  const canScroll = totalRows > ROWS;
  const trackScaledHeight = TRACK_HEIGHT * SCALE;
  const thumbScaledHeight = canScroll
    ? Math.round(Math.max(THUMB_HEIGHT * SCALE, trackScaledHeight * (ROWS / totalRows)))
    : trackScaledHeight;
  const maxTop = trackScaledHeight - thumbScaledHeight;
  const offs = maxRowOffset > 0 ? rowOffset / maxRowOffset : 0;

  thumbEl.style.display = canScroll ? 'block' : 'none';
  thumbEl.style.height = `${thumbScaledHeight}px`;
  thumbEl.style.backgroundSize = `${THUMB_WIDTH * 2 * SCALE}px ${thumbScaledHeight}px`;
  thumbEl.style.top = `${Math.round(offs * maxTop)}px`;

  // Use active/inactive texture states from the scrollbar sprite sheet
  thumbEl.style.backgroundPosition = dragging ? `-${THUMB_WIDTH * SCALE}px 0px` : `0px 0px`;
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

function scrollByRows(dir, page = 1) {
  rowOffset = Math.max(0, Math.min(maxRowOffset, rowOffset + dir * page));
  renderScroll();
}

function setRowFromRatio(rel) {
  rowOffset = Math.round(Math.max(0, Math.min(1, rel)) * maxRowOffset);
  renderScroll();
}

function onTrackClick(e) {
  if (e.target === thumbEl || maxRowOffset <= 0) return;
  const thumbTop = thumbEl.getBoundingClientRect().top;
  scrollByRows(e.clientY < thumbTop ? -1 : 1, ROWS);
}

function onThumbDown(e) {
  if (maxRowOffset <= 0) return;
  dragging = true;
  updateThumbDrag(e);
  document.addEventListener('mousemove', onThumbMove);
  document.addEventListener('mouseup', onThumbUp);
  e.stopPropagation();
  e.preventDefault();
}

function onThumbMove(e) {
  if (!dragging) return;
  updateThumbDrag(e);
}

function updateThumbDrag(e) {
  const rect = trackEl.getBoundingClientRect();
  const thumbScaledHeight = thumbEl.getBoundingClientRect().height;
  const maxTop = rect.height - thumbScaledHeight;
  const rel = (e.clientY - rect.top - thumbScaledHeight / 2) / maxTop;
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
  cancelDrag();
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