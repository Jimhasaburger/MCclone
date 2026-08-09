import JSZip from 'jszip';

const PREFIX = 'mcworld_chunk_';

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

export function loadSavedChunk(cx, cz) {
  const text = localStorage.getItem(PREFIX + chunkKey(cx, cz));
  return text === null ? null : parseBlocks(text);
}

export function saveChunkToStorage(cx, cz, blocks) {
  localStorage.setItem(PREFIX + chunkKey(cx, cz), serializeBlocks(blocks));
}

export function getAllSavedChunks() {
  const chunks = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(PREFIX)) continue;
    const [cx, cz] = key.slice(PREFIX.length).split(',');
    chunks.push({ cx: Number(cx), cz: Number(cz), data: localStorage.getItem(key) });
  }
  return chunks;
}

export function clearSavedChunks() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(PREFIX)) keys.push(key);
  }
  keys.forEach(key => localStorage.removeItem(key));
}

export async function exportWorld() {
  const saved = getAllSavedChunks();
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
  clearSavedChunks();
  for (const c of chunks) {
    localStorage.setItem(PREFIX + chunkKey(c.cx, c.cz), c.data);
  }
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
      exportWorld();
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
