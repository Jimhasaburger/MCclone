import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT, RENDER_DISTANCE, PLAYER_HEIGHT, PLAYER_SIZE } from './config.js';
import { getHeight } from './noise.js';
import { materials } from './textures.js';
import { loadSavedChunk, saveChunkToStorage } from './save.js';

const chunks = new Map();
const blockMap = new Map();
const dummy = new THREE.Object3D();
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

let scene;
let camera;

export function initWorld(sceneRef, cameraRef) {
  scene = sceneRef;
  camera = cameraRef;
}

function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

function blockKey(x, y, z) {
  return `${x},${y},${z}`;
}

export function hasBlock(x, y, z) {
  return blockMap.has(blockKey(x, y, z));
}

export function addBlock(x, y, z, id = 1) {
  blockMap.set(blockKey(x, y, z), id);
}

export function removeBlock(x, y, z) {
  blockMap.delete(blockKey(x, y, z));
}

function saveChunk(cx, cz) {
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const blocks = [];
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = ox + lx;
      const wz = oz + lz;
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        const id = blockMap.get(blockKey(wx, y, wz));
        if (id) blocks.push([wx, y, wz, id]);
      }
    }
  }
  saveChunkToStorage(cx, cz, blocks);
}

function saveChunkFromKey(key) {
  if (!chunks.has(key)) return;
  const [cx, cz] = key.split(',').map(Number);
  saveChunk(cx, cz);
}

function loadChunk(cx, cz) {
  const saved = loadSavedChunk(cx, cz);
  if (saved) {
    for (const [x, y, z, id] of saved) blockMap.set(blockKey(x, y, z), id);
    return;
  }
  generateTerrain(cx, cz);
  saveChunk(cx, cz);
}

function generateTerrain(cx, cz) {
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = ox + lx;
      const wz = oz + lz;
      const h = getHeight(wx, wz);
      for (let y = 0; y < h; y++) {
        addBlock(wx, y, wz);
      }
    }
  }
}

function buildChunk(cx, cz) {
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const positions = [];
  const worldPositions = [];

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = ox + lx;
      const wz = oz + lz;
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        if (!blockMap.has(blockKey(wx, y, wz))) continue;
        positions.push(lx + 0.5, y + 0.5, lz + 0.5);
        worldPositions.push(wx, y, wz);
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

  for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
    for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
      const key = chunkKey(cx + dx, cz + dz);
      needed.add(key);
      if (!chunks.has(key)) {
        loadChunk(cx + dx, cz + dz);
        const mesh = buildChunk(cx + dx, cz + dz);
        if (mesh) {
          scene.add(mesh);
          chunks.set(key, mesh);
        } else {
          chunks.set(key, null);
        }
      }
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

export function rebuildChunksAround(wx, wz) {
  const cx = Math.floor(wx / CHUNK_SIZE);
  const cz = Math.floor(wz / CHUNK_SIZE);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const key = chunkKey(cx + dx, cz + dz);
      saveChunkFromKey(key);
      const mesh = chunks.get(key);
      if (mesh) scene.remove(mesh);
      chunks.delete(key);
    }
  }
}

export function saveAllLoadedChunks() {
  for (const key of chunks.keys()) {
    saveChunkFromKey(key);
  }
}

export function reloadWorld() {
  for (const [key, mesh] of chunks) {
    if (mesh) scene.remove(mesh);
  }
  chunks.clear();
  blockMap.clear();
  updateChunks();
}

export function getChunks() {
  return chunks;
}

export function isSolid(wx, wy, wz) {
  if (wy < 0 || wy >= CHUNK_HEIGHT) return false;
  return blockMap.has(blockKey(Math.floor(wx), wy, Math.floor(wz)));
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
