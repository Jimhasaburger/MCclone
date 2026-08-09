import * as THREE from 'three';
import { FACE_ORDER, BLOCK_INDEX_FILE } from './config.js';

const fallbackMats = FACE_ORDER.map(() => new THREE.MeshStandardMaterial({ color: 0x7c9c6e }));

export const blockDefs = new Map();
export const blockMaterials = new Map();

const loader = new THREE.TextureLoader();

function parseLayers(spec) {
  const layers = [];
  const parts = String(spec).split(',');
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^(-?\d+)_(-?\d+)$/);
    if (m) {
      const min = Math.min(Number(m[1]), Number(m[2]));
      const max = Math.max(Number(m[1]), Number(m[2]));
      for (let i = min; i <= max; i++) layers.push(i);
    } else {
      const n = Number(p);
      if (Number.isFinite(n)) layers.push(n);
    }
  }
  return layers;
}

async function loadBlockDef(name) {
  const res = await fetch(`assets/data/blocks/${name}`);
  const data = await res.json();
  data.layers = parseLayers(data.layer);
  blockDefs.set(data.id, data);

  const mats = FACE_ORDER.map(() => new THREE.MeshStandardMaterial({ color: 0x7c9c6e }));
  const sides = data.sides || {};
  await Promise.all(
    FACE_ORDER.map(async (face, i) => {
      const path = sides[face];
      if (!path) return;
      const tex = await loader.loadAsync(path);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      mats[i] = new THREE.MeshStandardMaterial({ map: tex });
    })
  );
  blockMaterials.set(data.id, mats);
}

export function getBlockMaterials(id) {
  return blockMaterials.get(id) || fallbackMats;
}

export function getBlockDefs() {
  return [...blockDefs.values()];
}

export async function loadTextures() {
  try {
    const res = await fetch(BLOCK_INDEX_FILE);
    const names = await res.json();
    await Promise.all(names.map(loadBlockDef));
  } catch (e) {
    console.error('Failed to load block defs', e);
  }
}
