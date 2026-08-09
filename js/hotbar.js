import { getBlockDefs, getBlockIconPath } from './textures.js';
import { showText } from './ui.js';

let hotbarEl;
let selectedSlot = 0;
const slots = [];
const slotBlocks = [];

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
  selectSlot(0);

  document.addEventListener('keydown', e => {
    const n = e.key;
    if (n >= '1' && n <= '9') selectSlot(Number(n) - 1);
  });

  document.addEventListener('wheel', e => {
    e.preventDefault();
    selectSlot(selectedSlot + (e.deltaY > 0 ? 1 : -1));
  });
}

export function refreshHotbar() {
  const defs = getBlockDefs().filter(d => !d.unbreakable && d.solid !== false);
  slots.forEach((wrap, i) => {
    const icon = wrap.querySelector('.hotbar-icon');
    const def = defs[i];
    slotBlocks[i] = def || null;
    wrap.classList.toggle('filled', Boolean(def));
    icon.src = def ? getBlockIconPath(def.id) || '' : '';
  });
}

function displayName(def) {
  if (!def || !def.name) return '';
  return def.name.charAt(0).toUpperCase() + def.name.slice(1);
}

function selectSlot(i) {
  selectedSlot = ((i % 9) + 9) % 9;
  slots.forEach((wrap, idx) => wrap.classList.toggle('active', idx === selectedSlot));
  const def = slotBlocks[selectedSlot];
  showText(def ? displayName(def) : '');
}

export function getSelectedSlot() {
  return selectedSlot;
}

export function getSelectedBlockId() {
  return slotBlocks[selectedSlot] ? slotBlocks[selectedSlot].id : null;
}
