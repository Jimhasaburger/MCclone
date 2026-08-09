import JSZip from 'jszip';

const DB_NAME = 'mcworld';
const STORE = 'chunks';

let db;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
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

export function serializeBlocks(blocks) {
  return blocks.map(([x, y, z, id]) => `${id} ${x} ${y} ${z}`).join('\n');
}

export function parseBlocks(text) {
  const blocks = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const id = Number(parts[0]);
    const x = Number(parts[1]);
    const y = Number(parts[2]);
    const z = Number(parts[3]);
    if ([id, x, y, z].every(Number.isFinite)) blocks.push([x, y, z, id]);
  }
  return blocks;
}

export async function loadSavedChunk(cx, cz) {
  const d = await openDB();
  const text = await idbRequest(d.transaction(STORE).objectStore(STORE).get(chunkKey(cx, cz)));
  return text === undefined ? null : parseBlocks(text);
}

export async function saveChunkToStorage(cx, cz, blocks) {
  const d = await openDB();
  await idbRequest(d.transaction(STORE, 'readwrite').objectStore(STORE).put(serializeBlocks(blocks), chunkKey(cx, cz)));
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
}

export async function exportWorld() {
  const saved = await getAllSavedChunks();
  const zip = new JSZip();
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
  return chunks;
}

export function initSaveControls(onImport) {
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
    }
  });

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const chunks = await importWorld(file);
      onImport(chunks);
    } catch (err) {
      console.error('Failed to import world', err);
    }
  });
}
