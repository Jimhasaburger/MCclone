import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT, RENDER_DISTANCE, PLAYER_HEIGHT, PLAYER_SIZE } from './config.js';
import { getHeight } from './noise.js';
import { materials } from './textures.js';
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
    generateTerrain(cx, cz);
    saveChunk(cx, cz);
  }
  loadedChunks.add(key);
}

function generateTerrain(cx, cz) {
  const grid = getGrid(cx, cz);
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const h = getHeight(ox + lx, oz + lz);
      const base = (lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT;
      for (let y = 0; y < h; y++) {
        grid[base + y] = 1;
      }
    }
  }
}

function buildChunk(cx, cz) {
  const grid = chunkData.get(chunkKey(cx, cz));
  if (!grid) return null;
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const positions = [];
  const worldPositions = [];

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const base = (lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT;
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        if (grid[base + y] === 0) continue;
        positions.push(lx + 0.5, y + 0.5, lz + 0.5);
        worldPositions.push(ox + lx, y, oz + lz);
      }
    }
  }

  if (positions.length === 0) return null;

  const mesh = new THREE.InstancedMesh(boxGeo, materials, positions.length / 3);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < positions.length; i += 3) {
    dummy.position.set(positions[i], positions[i + 1], positions[i + 2]);
    dummy.updateMatrix();
    matrix.copy(dummy.matrix);
    mesh.setMatrixAt(i / 3, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.position.set(ox, 0, oz);
  mesh.userData.blockPositions = worldPositions;
  return mesh;
}

export function updateChunks() {
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
      loadChunk(cx + dx, cz + dz)
        .catch(err => {
          console.error('Failed to load chunk', key, err);
          generateTerrain(cx + dx, cz + dz);
        })
        .then(() => {
          loading.delete(key);
          if (ver !== worldVersion || chunks.has(key) || !needed.has(key)) return;
          const mesh = buildChunk(cx + dx, cz + dz);
          if (mesh) scene.add(mesh);
          chunks.set(key, mesh);
        });
    }
  }

  for (const [key, mesh] of chunks) {
    if (!needed.has(key)) {
      if (mesh) scene.remove(mesh);
      saveChunkFromKey(key);
      chunks.delete(key);
    }
  }
}

export function rebuildChunk(wx, wz) {
  const cx = Math.floor(wx / CHUNK_SIZE);
  const cz = Math.floor(wz / CHUNK_SIZE);
  const key = chunkKey(cx, cz);
  const old = chunks.get(key);
  if (old) scene.remove(old);
  chunks.delete(key);
  saveChunk(cx, cz);
  const mesh = buildChunk(cx, cz);
  if (mesh) scene.add(mesh);
  chunks.set(key, mesh);
}

export function saveAllLoadedChunks() {
  for (const key of chunks.keys()) {
    saveChunkFromKey(key);
  }
}

export function reloadWorld() {
  worldVersion++;
  for (const [key, mesh] of chunks) {
    if (mesh) scene.remove(mesh);
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
  const y0 = wy;
  const y1 = wy + PLAYER_HEIGHT;
  const r2 = PLAYER_SIZE * PLAYER_SIZE;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const cx = Math.floor(wx) + dx;
      const cz = Math.floor(wz) + dz;
      for (let yy = Math.floor(y0); yy <= Math.floor(y1); yy++) {
        if (!isSolid(cx, yy, cz)) continue;
        let ddx = 0;
        if (wx < cx) ddx = cx - wx;
        else if (wx > cx + 1) ddx = wx - (cx + 1);
        let ddz = 0;
        if (wz < cz) ddz = cz - wz;
        else if (wz > cz + 1) ddz = wz - (cz + 1);
        let ddy = 0;
        if (y1 < yy) ddy = yy - y1;
        else if (y0 > yy + 1) ddy = y0 - (yy + 1);
        if (ddx * ddx + ddz * ddz + ddy * ddy <= r2) return true;
      }
    }
  }
  return false;
}
