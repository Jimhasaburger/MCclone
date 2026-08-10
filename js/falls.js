import * as THREE from 'three';
import { CHUNK_HEIGHT, PLAYER_HEIGHT, PLAYER_SIZE } from './config.js';
import { removeBlock, addBlock, rebuildChunk, getBlockId, isSolid } from './world.js';
import { isFallingBlock, getBlockMaterials } from './textures.js';
import { playerPos } from './player.js';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const GRAVITY = 28;
const MAX_SPEED = 14;

const falls = new Map();
let scene;

export function initFalls(sceneRef) {
  scene = sceneRef;
}

function blockIntersectsPlayer(x, y, z) {
  return (
    x + 1 > playerPos.x - PLAYER_SIZE &&
    x < playerPos.x + PLAYER_SIZE &&
    y + 1 > playerPos.y &&
    y < playerPos.y + PLAYER_HEIGHT &&
    z + 1 > playerPos.z - PLAYER_SIZE &&
    z < playerPos.z + PLAYER_SIZE
  );
}

export function startFall(x, y, z) {
  const key = `${x},${z}`;
  if (falls.has(key)) return;
  const id = getBlockId(x, y, z);
  if (!id || !isFallingBlock(id)) return;
  const mesh = new THREE.Mesh(boxGeo, getBlockMaterials(id));
  mesh.position.set(x, y + 0.5, z);
  scene.add(mesh);
  removeBlock(x, y, z);
  rebuildChunk(x, z);
  falls.set(key, { id, x, z, posY: y + 0.5, vy: 0, mesh });
  startFall(x, y + 1, z);
}

export function startFallsAbove(x, y, z) {
  startFall(x, y + 1, z);
}

export function checkBlockFalls(x, y, z) {
  if (!isFallingBlock(getBlockId(x, y, z))) return;
  if (isSolid(x, y - 1, z)) return;
  startFall(x, y, z);
}

function land(f, cell) {
  scene.remove(f.mesh);
  falls.delete(`${f.x},${f.z}`);
  if (cell < 0 || cell >= CHUNK_HEIGHT) return;
  if (getBlockId(f.x, cell, f.z)) return;
  addBlock(f.x, cell, f.z, f.id);
  rebuildChunk(f.x, f.z);
  startFall(f.x, cell + 1, f.z);
}

export function updateFalls(dt) {
  for (const f of falls.values()) {
    f.vy -= GRAVITY * dt;
    if (f.vy < -MAX_SPEED) f.vy = -MAX_SPEED;
    let y = f.posY;
    const dy = f.vy * dt;
    const steps = Math.max(1, Math.ceil(Math.abs(dy) / 0.25));
    const step = dy / steps;
    let stopped = false;
    for (let i = 0; i < steps; i++) {
      y += step;
      const cell = Math.floor(y);
      if (cell <= 0) {
        land(f, 0);
        stopped = true;
        break;
      }
      if (isSolid(f.x, cell - 1, f.z)) {
        land(f, cell);
        stopped = true;
        break;
      }
      if (blockIntersectsPlayer(f.x, cell, f.z)) {
        land(f, Math.floor(playerPos.y + PLAYER_HEIGHT + 0.001));
        stopped = true;
        break;
      }
    }
    if (!stopped) f.posY = y;
  }
}