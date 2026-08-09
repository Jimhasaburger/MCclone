import * as THREE from 'three';
import { FACE_ORDER, BLOCK_TEXTURE_FILE } from './config.js';

const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0x7c9c6e });
export const materials = FACE_ORDER.map(() => fallbackMaterial);

const loader = new THREE.TextureLoader();

export async function loadTextures() {
  try {
    const res = await fetch(BLOCK_TEXTURE_FILE);
    const data = await res.json();
    const sides = data.sides;
    await Promise.all(
      FACE_ORDER.map(async (name, i) => {
        const path = sides[name];
        if (!path) return;
        const tex = await loader.loadAsync(path);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        materials[i] = new THREE.MeshStandardMaterial({ map: tex });
      })
    );
  } catch (e) {
    console.error('Failed to load textures', e);
  }
}
