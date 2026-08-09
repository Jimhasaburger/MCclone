import JSZip from 'jszip';
import { CHUNK_SIZE, CHUNK_HEIGHT } from './config.js';
import { getSeed } from './noise.js';

const DB_NAME = 'mcworld';
const STORE = 'chunks';
const META_STORE = 'meta';
const SEED_KEY = 'seed';

const BASE71_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!@$%?&<()';

function encodeBase71(n) {
  if (n === 0) return BASE71_CHARS[0];
  let out = '';
  while (n > 0) {
    out = BASE71_CHARS[n % 71] + out;
    n = Math.floor(n / 71);
  }
  return out;
}

function decodeBase71(s) {
  let n = 0;
  for (const c of s) {
    const i = BASE71_CHARS.indexOf(c);
    if (i === -1) return undefined;
    n = n * 71 + i;
  }
  return n;
}

function blockToken(lx, y, lz, id) {
  const pos = (lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT + y;
  return encodeBase71(pos * 256 + id);
}

function parseToken(token) {
  const n = decodeBase71(token);
  if (n === undefined) return null;
  const id = n % 256;
  const pos = Math.floor(n / 256);
  const y = pos % CHUNK_HEIGHT;
  const lz = Math.floor(pos / CHUNK_HEIGHT) % CHUNK_SIZE;
  const lx = Math.floor(pos / (CHUNK_HEIGHT * CHUNK_SIZE));
  return [lx, y, lz, id];
}

let db;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      if (!req.result.objectStoreNames.contains(META_STORE)) req.result.createObjectStore(META_STORE);
    };
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

export function serializeBlocks(cx, cz, blocks) {
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const lines = [];
  for (const [x, y, z, id] of blocks) {
    lines.push(blockToken(x - ox, y, z - oz, id));
  }
  return lines.join('\n');
}

export function parseBlocks(cx, cz, text) {
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const blocks = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const t = line.trim();
    if (t.includes(' ')) {
      const parts = t.split(/\s+/);
      if (parts.length < 4) continue;
      const id = Number(parts[0]);
      const x = Number(parts[1]);
      const y = Number(parts[2]);
      const z = Number(parts[3]);
      if ([id, x, y, z].every(Number.isFinite)) blocks.push([x, y, z, id]);
      continue;
    }
    const local = parseToken(t);
    if (!local) continue;
    blocks.push([ox + local[0], local[1], oz + local[2], local[3]]);
  }
  return blocks;
}

export async function loadSavedChunk(cx, cz) {
  const d = await openDB();
  const text = await idbRequest(d.transaction(STORE).objectStore(STORE).get(chunkKey(cx, cz)));
  return text === undefined ? null : parseBlocks(cx, cz, text);
}

export async function saveChunkToStorage(cx, cz, blocks) {
  const d = await openDB();
  await idbRequest(d.transaction(STORE, 'readwrite').objectStore(STORE).put(serializeBlocks(cx, cz, blocks), chunkKey(cx, cz)));
}

export async function getSavedSeed() {
  const d = await openDB();
  const v = await idbRequest(d.transaction(META_STORE).objectStore(META_STORE).get(SEED_KEY));
  return v === undefined ? null : v;
}

export async function saveSeed(seed) {
  const d = await openDB();
  await idbRequest(d.transaction(META_STORE, 'readwrite').objectStore(META_STORE).put(seed, SEED_KEY));
}

export async function getAllSavedChunks() {
  const d = await openDB();
  const store = d.transaction(STORE).objectStore(STORE);
  const keys = await idbRequest(store.getAllKeys());
  const values = await idbRequest(store.getAll());
  return keys.map((key, i) => {
    const [cx, cz] = key.split(',');
    return { cx: Number(cx), cz: Number(cz), data: values[i] };
  });
}

export async function clearSavedChunks() {
  const d = await openDB();
  await idbRequest(d.transaction(STORE, 'readwrite').objectStore(STORE).clear());
  await idbRequest(d.transaction(META_STORE, 'readwrite').objectStore(META_STORE).clear());
}

export async function exportWorld() {
  const saved = await getAllSavedChunks();
  const zip = new JSZip();
  zip.file('seed.txt', String(getSeed()));
  for (const c of saved) {
    zip.file(`${c.cx}-${c.cz}.txt`, c.data);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'world.zip';
  a.click();
  URL.revokeObjectURL(url);
  console.log(`Exported ${saved.length} chunks`);
}

export async function importWorld(file) {
  const zip = await JSZip.loadAsync(file);
  const names = Object.keys(zip.files);
  const chunks = [];
  let seed = null;
  if (zip.files['seed.txt']) {
    const text = await zip.files['seed.txt'].async('string');
    const n = Number(text.trim());
    if (Number.isFinite(n)) seed = n >>> 0;
  }
  for (const name of names) {
    const m = name.match(/^(-?\d+)-(-?\d+)\.txt$/);
    if (!m) continue;
    const text = await zip.files[name].async('string');
    chunks.push({ cx: Number(m[1]), cz: Number(m[2]), data: text });
  }
  const d = await openDB();
  const tx = d.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  await idbRequest(store.clear());
  for (const c of chunks) {
    store.put(c.data, chunkKey(c.cx, c.cz));
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  return { chunks, seed };
}

export function initSaveControls(onImport, onReset) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip,application/zip';
  input.style.display = 'none';
  document.body.appendChild(input);

  document.addEventListener('keydown', e => {
    if (e.code === 'KeyG') {
      e.preventDefault();
      exportWorld().catch(err => console.error('Failed to export world', err));
    } else if (e.code === 'KeyI') {
      e.preventDefault();
      input.click();
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      if (onReset) onReset();
    }
  });

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const result = await importWorld(file);
      onImport(result);
    } catch (err) {
      console.error('Failed to import world', err);
    }
  });
}
