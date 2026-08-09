import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT, RENDER_DISTANCE, PLAYER_HEIGHT, PLAYER_SIZE } from './config.js';
import { getBlockMaterials, isTexturesReady } from './textures.js';
import { generateTerrain } from './worldgen.js';
import { loadSavedChunk, saveChunkToStorage } from './save.js';

const chunks = new Map();
const loading = new Set();
const loadedChunks = new Set();
const chunkData = new Map();
const dummy = new THREE.Object3D();
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

const GRID_SIZE = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE;

let scene;
let camera;
let worldVersion = 0;
let pendingLoads = 0;
let worldReady = false;

function checkWorldReady() {
  if (pendingLoads === 0) worldReady = true;
}

export function isWorldReady() {
  return worldReady;
}

export function initWorld(sceneRef, cameraRef) {
  scene = sceneRef;
  camera = cameraRef;
}

function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

function chunkIndex(wx, y, wz) {
  const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return (lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT + y;
}

function getGrid(cx, cz) {
  const key = chunkKey(cx, cz);
  let grid = chunkData.get(key);
  if (!grid) {
    grid = new Uint8Array(GRID_SIZE);
    chunkData.set(key, grid);
  }
  return grid;
}

export function hasBlock(x, y, z) {
  if (y < 0 || y >= CHUNK_HEIGHT) return false;
  const grid = chunkData.get(chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)));
  return grid ? grid[chunkIndex(x, y, z)] !== 0 : false;
}

export function addBlock(x, y, z, id = 1) {
  getGrid(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE))[chunkIndex(x, y, z)] = id;
}

export function removeBlock(x, y, z) {
  const grid = chunkData.get(chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)));
  if (grid) grid[chunkIndex(x, y, z)] = 0;
}

export function getBlockId(x, y, z) {
  if (y < 0 || y >= CHUNK_HEIGHT) return 0;
  const grid = chunkData.get(chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)));
  return grid ? grid[chunkIndex(x, y, z)] : 0;
}

function saveChunk(cx, cz) {
  const grid = chunkData.get(chunkKey(cx, cz));
  if (!grid) return;
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const blocks = [];
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const base = (lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT;
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        const id = grid[base + y];
        if (id) blocks.push([ox + lx, y, oz + lz, id]);
      }
    }
  }
  saveChunkToStorage(cx, cz, blocks).catch(err => console.error('Failed to save chunk', err));
}

function saveChunkFromKey(key) {
  if (!chunks.has(key)) return;
  const [cx, cz] = key.split(',').map(Number);
  saveChunk(cx, cz);
}

async function loadChunk(cx, cz) {
  const key = chunkKey(cx, cz);
  if (loadedChunks.has(key)) return;
  const saved = await loadSavedChunk(cx, cz);
  if (saved) {
    const grid = getGrid(cx, cz);
    for (const [x, y, z, id] of saved) grid[chunkIndex(x, y, z)] = id;
  } else {
    generateTerrain(cx, cz, getGrid(cx, cz));
    saveChunk(cx, cz);
  }
  loadedChunks.add(key);
}

function blockIsExposed(grid, lx, y, lz) {
  if (y <= 0 || y >= CHUNK_HEIGHT - 1) return true;
  if (lx <= 0 || lx >= CHUNK_SIZE - 1 || lz <= 0 || lz >= CHUNK_SIZE - 1) return true;
  const base = (lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT;
  return (
    grid[base + y + 1] === 0 ||
    grid[base + y - 1] === 0 ||
    grid[base + y + CHUNK_HEIGHT] === 0 ||
    grid[base + y - CHUNK_HEIGHT] === 0 ||
    grid[base + y + CHUNK_HEIGHT * CHUNK_SIZE] === 0 ||
    grid[base + y - CHUNK_HEIGHT * CHUNK_SIZE] === 0
  );
}

function buildChunk(cx, cz) {
  const grid = chunkData.get(chunkKey(cx, cz));
  if (!grid) return null;
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const groups = new Map();

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const base = (lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT;
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        const id = grid[base + y];
        if (!id || !blockIsExposed(grid, lx, y, lz)) continue;
        let g = groups.get(id);
        if (!g) {
          g = { positions: [], worldPositions: [] };
          groups.set(id, g);
        }
        g.positions.push(lx + 0.5, y + 0.5, lz + 0.5);
        g.worldPositions.push(ox + lx, y, oz + lz);
      }
    }
  }

  if (groups.size === 0) return null;

  const meshes = [];
  for (const [id, g] of groups) {
    const mesh = new THREE.InstancedMesh(boxGeo, getBlockMaterials(id), g.positions.length / 3);
    for (let i = 0; i < g.positions.length; i += 3) {
      dummy.position.set(g.positions[i], g.positions[i + 1], g.positions[i + 2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i / 3, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.position.set(ox, 0, oz);
    mesh.userData.blockPositions = g.worldPositions;
    meshes.push(mesh);
  }
  return meshes;
}

export function updateChunks() {
  if (!isTexturesReady()) return;
  const cx = Math.floor(camera.position.x / CHUNK_SIZE);
  const cz = Math.floor(camera.position.z / CHUNK_SIZE);
  const needed = new Set();
  const ver = worldVersion;

  for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
    for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
      const key = chunkKey(cx + dx, cz + dz);
      needed.add(key);
      if (chunks.has(key) || loading.has(key)) continue;
      loading.add(key);
      pendingLoads++;
      loadChunk(cx + dx, cz + dz)
        .catch(err => {
          console.error('Failed to load chunk', key, err);
          generateTerrain(cx + dx, cz + dz, getGrid(cx + dx, cz + dz));
        })
        .then(() => {
          loading.delete(key);
          pendingLoads--;
          if (ver !== worldVersion || chunks.has(key) || !needed.has(key)) {
            checkWorldReady();
            return;
          }
          const meshes = buildChunk(cx + dx, cz + dz);
          if (meshes) meshes.forEach(m => scene.add(m));
          chunks.set(key, meshes);
          checkWorldReady();
        });
    }
  }

  for (const [key, meshes] of chunks) {
    if (!needed.has(key)) {
      if (meshes) meshes.forEach(m => scene.remove(m));
      saveChunkFromKey(key);
      chunks.delete(key);
    }
  }

  checkWorldReady();
}

export function rebuildChunk(wx, wz) {
  const cx = Math.floor(wx / CHUNK_SIZE);
  const cz = Math.floor(wz / CHUNK_SIZE);
  const key = chunkKey(cx, cz);
  const old = chunks.get(key);
  if (old) old.forEach(m => scene.remove(m));
  chunks.delete(key);
  saveChunk(cx, cz);
  const meshes = buildChunk(cx, cz);
  if (meshes) meshes.forEach(m => scene.add(m));
  chunks.set(key, meshes);
}

export function saveAllLoadedChunks() {
  for (const key of chunks.keys()) {
    saveChunkFromKey(key);
  }
}

export function reloadWorld() {
  worldVersion++;
  worldReady = false;
  pendingLoads = 0;
  for (const [key, meshes] of chunks) {
    if (meshes) meshes.forEach(m => scene.remove(m));
  }
  chunks.clear();
  loading.clear();
  loadedChunks.clear();
  chunkData.clear();
  updateChunks();
}

export function getChunks() {
  return chunks;
}

export function isSolid(wx, wy, wz) {
  if (wy < 0 || wy >= CHUNK_HEIGHT) return false;
  const grid = chunkData.get(chunkKey(Math.floor(wx / CHUNK_SIZE), Math.floor(wz / CHUNK_SIZE)));
  return grid ? grid[chunkIndex(wx, wy, wz)] !== 0 : false;
}

export function collidesAt(wx, wy, wz) {
  const px0 = wx - PLAYER_SIZE;
  const px1 = wx + PLAYER_SIZE;
  const py0 = wy;
  const py1 = wy + PLAYER_HEIGHT;
  const pz0 = wz - PLAYER_SIZE;
  const pz1 = wz + PLAYER_SIZE;
  for (let bx = Math.floor(px0); bx <= Math.floor(px1); bx++) {
    for (let by = Math.floor(py0); by <= Math.floor(py1); by++) {
      for (let bz = Math.floor(pz0); bz <= Math.floor(pz1); bz++) {
        if (!isSolid(bx, by, bz)) continue;
        if (
          px0 < bx + 1 && px1 > bx &&
          py0 < by + 1 && py1 > by &&
          pz0 < bz + 1 && pz1 > bz
        ) return true;
      }
    }
  }
  return false;
}
