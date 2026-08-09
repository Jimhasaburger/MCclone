import * as THREE from 'three';
import { FACE_ORDER, BLOCK_INDEX_FILE } from './config.js';

const fallbackMats = FACE_ORDER.map(() => new THREE.MeshStandardMaterial({ color: 0x7c9c6e }));

export const blockDefs = new Map();
export const blockMaterials = new Map();

const loader = new THREE.TextureLoader();

function makeFallbackMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x7c9c6e });
}

async function loadFaceMaterial(path) {
  if (!path) return makeFallbackMaterial();
  try {
    const tex = await loader.loadAsync(path);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5 });
  } catch (e) {
    console.error(`Failed to load texture ${path}`, e);
    return makeFallbackMaterial();
  }
}

async function loadBlockDef(name, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`assets/data/blocks/${name}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      blockDefs.set(data.id, data);

      const sides = data.sides || {};
      const mats = await Promise.all(
        FACE_ORDER.map(face => loadFaceMaterial(sides[face]))
      );
      blockMaterials.set(data.id, mats);
      return;
    } catch (e) {
      if (attempt === retries) {
        console.error(`Failed to load block def ${name} after ${retries + 1} attempts`, e);
      } else {
        await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
      }
    }
  }
}

export function getBlockMaterials(id) {
  return blockMaterials.get(id) || fallbackMats;
}

export function isTexturesReady() {
  return blockDefs.size > 0 && blockMaterials.size >= blockDefs.size;
}

export function isUnbreakable(id) {
  return Boolean(blockDefs.get(id)?.unbreakable);
}

export function getBlockIconPath(id) {
  const def = blockDefs.get(id);
  if (!def || !def.sides) return null;
  return (
    def.sides.north ||
    def.sides.south ||
    def.sides.east ||
    def.sides.west ||
    def.sides.top ||
    def.sides.bottom
  );
}

export function getBlockDefs() {
  return [...blockDefs.values()];
}

export async function loadTextures() {
  const res = await fetch(BLOCK_INDEX_FILE);
  if (!res.ok) throw new Error(`Failed to load block index: HTTP ${res.status}`);
  const names = await res.json();
  await Promise.all(names.map(name => loadBlockDef(name)));
}
