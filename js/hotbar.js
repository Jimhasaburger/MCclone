import { getBlockDefs, getBlockIconPath } from './textures.js';
import { showText } from './ui.js';
import { DATA_VERSION } from './config.js';

let hotbarEl;
let menuEl;
let domElement;
let selectedSlot = 0;
let activeCategory = null;
let categories = [];
const slots = [];
const slotBlocks = [];
const categoryMenus = new Map();

export async function loadHotbarCategories() {
  const res = await fetch(`assets/data/hotbar.json?v=${DATA_VERSION}`);
  const data = await res.json();
  categories = data.categories || [];
  activeCategory = data.default || (categories[0] && categories[0].name) || null;
  buildMenu();
}

export function initHotbar(canvasRef) {
  domElement = canvasRef;

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
    if (n >= '1' && n <= '9') {
      selectSlot(Number(n) - 1);
      return;
    }
    if (e.code === 'KeyE') {
      e.preventDefault();
      toggleHotbarMenu();
    }
  });

  document.addEventListener('wheel', e => {
    e.preventDefault();
    selectSlot(selectedSlot + (e.deltaY > 0 ? 1 : -1));
  });
}

export function refreshHotbar() {
  const defs = getBlockDefs();
  const map = new Map(defs.map(d => [d.id, d]));
  const cat = categories.find(c => c.name === activeCategory) || categories[0];
  const ids = cat ? cat.blocks : [];
  slots.forEach((wrap, i) => {
    const icon = wrap.querySelector('.hotbar-icon');
    const def = i < ids.length ? map.get(ids[i]) || null : null;
    slotBlocks[i] = def || null;
    wrap.classList.toggle('filled', Boolean(def));
    icon.src = def ? getBlockIconPath(def.id) || '' : '';
  });
  updateCategoryMenuIcons(map);
  selectSlot(selectedSlot);
}

function updateCategoryMenuIcons(map) {
  for (const cat of categories) {
    const m = categoryMenus.get(cat.name);
    if (!m) continue;
    m.icons.forEach((img, i) => {
      const id = cat.blocks[i];
      const def = map.get(id);
      img.src = def ? getBlockIconPath(def.id) || '' : '';
      img.classList.toggle('empty', !def);
    });
    m.row.classList.toggle('active', cat.name === activeCategory);
  }
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
  const def = slotBlocks[selectedSlot];
  showText(def ? displayName(def) : '');
}

function setActiveCategory(name) {
  activeCategory = name;
  refreshHotbar();
  hideHotbarMenu();
  if (domElement) domElement.requestPointerLock();
}

function buildMenu() {
  menuEl = document.createElement('div');
  menuEl.id = 'hotbar-menu';
  menuEl.style.display = 'none';

  const title = document.createElement('h2');
  title.textContent = 'Hotbars (click a slot)';
  menuEl.appendChild(title);

  const list = document.createElement('div');
  list.id = 'hotbar-menu-list';
  for (const cat of categories) {
    const row = document.createElement('div');
    row.className = 'hm-category';
    const label = document.createElement('span');
    label.className = 'hm-label';
    label.textContent = cat.name;
    const rowSlots = document.createElement('div');
    rowSlots.className = 'hm-slots';
    const icons = [];
    for (const id of cat.blocks) {
      const img = document.createElement('img');
      img.className = 'hm-icon';
      img.alt = '';
      img.addEventListener('click', () => setActiveCategory(cat.name));
      rowSlots.appendChild(img);
      icons.push(img);
    }
    row.appendChild(label);
    row.appendChild(rowSlots);
    list.appendChild(row);
    categoryMenus.set(cat.name, { row, icons });
  }
  menuEl.appendChild(list);
  document.body.appendChild(menuEl);
}

function hideHotbarMenu() {
  if (menuEl) menuEl.style.display = 'none';
}

function toggleHotbarMenu() {
  if (!menuEl) return;
  if (menuEl.style.display !== 'none') {
    hideHotbarMenu();
  } else {
    menuEl.style.display = 'block';
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

export function getSelectedSlot() {
  return selectedSlot;
}

export function getSelectedBlockId() {
  return slotBlocks[selectedSlot] ? slotBlocks[selectedSlot].id : null;
}
