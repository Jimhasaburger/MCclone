import { getBlockDefs, getBlockIconPath } from './textures.js';
import { showText } from './ui.js';

const DEFAULT_SLOTS = [1, 4, 2, 6, 5, 7, 8, 9, 10];

let hotbarEl;
let selectedSlot = 0;
let slotIds = [...DEFAULT_SLOTS];
const slots = [];

let inventoryOpen = () => false;
let onSelectChange = () => {};

export function setInventoryOpenCallback(fn) {
  inventoryOpen = fn;
}

export function setOnSelectChange(fn) {
  onSelectChange = fn;
}

export function initHotbar() {
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

  document.addEventListener('keydown', e => {
    const n = e.key;
    if (n >= '1' && n <= '9') selectSlot(Number(n) - 1);
  });

  document.addEventListener('wheel', e => {
    if (inventoryOpen()) return;
    e.preventDefault();
    selectSlot(selectedSlot + (e.deltaY > 0 ? 1 : -1));
  });

  refreshHotbar();
}

export function refreshHotbar() {
  const defs = getBlockDefs();
  const map = new Map(defs.map(d => [d.id, d]));
  slots.forEach((wrap, i) => {
    const icon = wrap.querySelector('.hotbar-icon');
    const def = map.get(slotIds[i]) || null;
    const path = def ? getBlockIconPath(def.id) : '';
    if (def && path) icon.src = path;
    else icon.removeAttribute('src');
    wrap.classList.toggle('filled', Boolean(def));
  });
  selectSlot(selectedSlot);
}

export function setHotbarSlot(i, id) {
  slotIds[i] = id;
  const def = getBlockDefs().find(d => d.id === id);
  const wrap = slots[i];
  const icon = wrap.querySelector('.hotbar-icon');
  const path = def ? getBlockIconPath(def.id) : '';
  if (def && path) icon.src = path;
  else icon.removeAttribute('src');
  wrap.classList.toggle('filled', Boolean(def));
  if (i === selectedSlot) showText(def ? displayName(def) : '');
}

export function getHotbarSlotIds() {
  return [...slotIds];
}

export function setSelectedSlot(i) {
  selectSlot(i);
}

export function getSelectedSlot() {
  return selectedSlot;
}

export function getSelectedBlockId() {
  return slotIds[selectedSlot] || null;
}

function displayName(def) {
  if (!def || !def.name) return '';
  return def.name
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function selectSlot(i) {
  selectedSlot = ((i % 9) + 9) % 9;
  slots.forEach((wrap, idx) => wrap.classList.toggle('active', idx === selectedSlot));
  const def = getBlockDefs().find(d => d.id === slotIds[selectedSlot]);
  showText(def ? displayName(def) : '');
  onSelectChange();
}
