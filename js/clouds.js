import * as THREE from 'three';
import { DATA_VERSION, CLOUD_HEIGHT } from './config.js';
import { rand2D } from './noise.js';

const CLOUD_TEXTURE = `assets/textures/envirnoment/clouds.png?v=${DATA_VERSION}`;
const MAP_SIZE = 256;
const SCALE = 8;
const VOXEL_STEP = 2;
const CELL_SIZE = 64;
const REGION_RADIUS = 2;
const BASE_OPACITY = 0.5;
const DRIFT_SPEED = 0.6;

let sceneRef;
let cloudGroup;
let mapData;
let drift = 0;
let driftRounded = 0;
let centerCx = null;
let centerCz = null;
let boxGeo;

const dummy = new THREE.Object3D();

function loadCloudMap() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height).data;
      mapData = new Float32Array(img.width * img.height);
      for (let i = 0; i < mapData.length; i++) {
        mapData[i] = data[i * 4 + 3] / 255;
      }
      blurMap();
      resolve();
    };
    img.onerror = reject;
    img.src = CLOUD_TEXTURE;
  });
}

function blurMap() {
  const src = new Float32Array(mapData);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ax = (x + dx + MAP_SIZE) % MAP_SIZE;
            const ay = (y + dy + MAP_SIZE) % MAP_SIZE;
            sum += src[ay * MAP_SIZE + ax];
          }
        }
        mapData[y * MAP_SIZE + x] = sum / 9;
      }
    }
    for (let i = 0; i < mapData.length; i++) src[i] = mapData[i];
  }
}

function sampleMap(x, z) {
  const mx = ((Math.floor(x / SCALE) % MAP_SIZE) + MAP_SIZE) % MAP_SIZE;
  const mz = ((Math.floor(z / SCALE) % MAP_SIZE) + MAP_SIZE) % MAP_SIZE;
  return mapData[mz * MAP_SIZE + mx];
}

function clearClouds() {
  if (!cloudGroup) return;
  while (cloudGroup.children.length) {
    const mesh = cloudGroup.children[cloudGroup.children.length - 1];
    cloudGroup.remove(mesh);
    if (mesh.geometry !== boxGeo) mesh.geometry.dispose();
    mesh.material.dispose();
  }
}

function buildCloudCell(cx, cz, material) {
  const ox = cx * CELL_SIZE;
  const oz = cz * CELL_SIZE;
  const positions = [];

  for (let x = ox; x < ox + CELL_SIZE; x += VOXEL_STEP) {
    for (let z = oz; z < oz + CELL_SIZE; z += VOXEL_STEP) {
      const value = sampleMap(x + driftRounded, z);
      if (value < 0.45) continue;
      const intensity = Math.min(1, (value - 0.4) / 0.6);
      let thick = 1 + Math.floor(intensity * 3);
      if (rand2D(x * 0.37, z * 0.41) > 0.8) thick++;
      const y0 = CLOUD_HEIGHT + (rand2D(x * 0.91, z * 0.73) > 0.5 ? 1 : 0);
      for (let i = 0; i < thick; i++) {
        positions.push(x + 0.5, y0 + 0.5 + i, z + 0.5);
      }
    }
  }

  if (positions.length === 0) return;

  const mesh = new THREE.InstancedMesh(boxGeo, material, positions.length / 3);
  for (let i = 0; i < positions.length; i += 3) {
    dummy.position.set(positions[i], positions[i + 1], positions[i + 2]);
    dummy.updateMatrix();
    mesh.setMatrixAt(i / 3, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  cloudGroup.add(mesh);
}

function rebuildClouds(px, pz) {
  centerCx = Math.floor(px / CELL_SIZE);
  centerCz = Math.floor(pz / CELL_SIZE);
  clearClouds();

  let material = null;
  for (let dcx = -REGION_RADIUS; dcx <= REGION_RADIUS; dcx++) {
    for (let dcz = -REGION_RADIUS; dcz <= REGION_RADIUS; dcz++) {
      if (!material) {
        material = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: BASE_OPACITY,
          depthWrite: false,
          fog: false,
        });
      }
      buildCloudCell(centerCx + dcx, centerCz + dcz, material);
    }
  }
}

export async function initClouds(scene) {
  sceneRef = scene;
  boxGeo = new THREE.BoxGeometry(1.2, 1, 1.2);
  cloudGroup = new THREE.Group();
  sceneRef.add(cloudGroup);
  await loadCloudMap();
  rebuildClouds(0, 0);
}

export function updateClouds(dt, px, pz) {
  if (!mapData || !cloudGroup) return;

  drift += DRIFT_SPEED * dt;
  const q = Math.floor(drift / VOXEL_STEP);
  const r = drift - q * VOXEL_STEP;
  const needsRebuild = q * VOXEL_STEP !== driftRounded;
  driftRounded = q * VOXEL_STEP;

  const ccx = Math.floor(px / CELL_SIZE);
  const ccz = Math.floor(pz / CELL_SIZE);
  cloudGroup.position.x = -r;
  if (needsRebuild || ccx !== centerCx || ccz !== centerCz) {
    rebuildClouds(px, pz);
  }
}