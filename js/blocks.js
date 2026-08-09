import * as THREE from 'three';
import { CHUNK_HEIGHT, PLAYER_HEIGHT, PLAYER_SIZE } from './config.js';
import { getChunks, rebuildChunk, hasBlock, addBlock, removeBlock, getBlockId } from './world.js';
import { isUnbreakable } from './textures.js';
import { getSelectedBlockId } from './hotbar.js';
import { showText } from './ui.js';
import { playerPos } from './player.js';
import { playBlockDigSound, playBlockPlaceSound } from './sounds.js';

const raycaster = new THREE.Raycaster();

const outlineGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
const outlineMat = new THREE.LineBasicMaterial({ color: 0x000000, depthTest: true });
const outline = new THREE.LineSegments(outlineGeo, outlineMat);
outline.scale.set(1.001, 1.001, 1.001);
outline.renderOrder = 10;
outline.visible = false;

let camera;

export function initBlocks(scene, cameraRef, domElement) {
  camera = cameraRef;
  scene.add(outline);

  document.addEventListener('contextmenu', e => e.preventDefault());

  domElement.addEventListener('mousedown', e => {
    if (document.pointerLockElement !== domElement) return;
    e.preventDefault();
    if (e.button === 0) breakBlock();
    else if (e.button === 2) placeBlock();
  });
}

function getTarget() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const intersects = raycaster.intersectObjects([...getChunks().values()].flat().filter(m => m));
  if (intersects.length === 0) return null;
  const hit = intersects[0];
  const mesh = hit.object;
  const idx = hit.instanceId;
  const bp = mesh.userData.blockPositions;
  if (!bp || idx === undefined) return null;
  return {
    hit,
    bx: Math.floor(bp[idx * 3]),
    by: Math.floor(bp[idx * 3 + 1]),
    bz: Math.floor(bp[idx * 3 + 2]),
  };
}

function blockIntersectsPlayer(px, py, pz) {
  return (
    px + 1 > playerPos.x - PLAYER_SIZE &&
    px < playerPos.x + PLAYER_SIZE &&
    py + 1 > playerPos.y &&
    py < playerPos.y + PLAYER_HEIGHT &&
    pz + 1 > playerPos.z - PLAYER_SIZE &&
    pz < playerPos.z + PLAYER_SIZE
  );
}

function breakBlock() {
  const target = getTarget();
  if (!target) return;
  const id = getBlockId(target.bx, target.by, target.bz);
  if (!id || isUnbreakable(id)) return;
  removeBlock(target.bx, target.by, target.bz);
  rebuildChunk(target.bx, target.bz);
  playBlockDigSound(id);
}

function placeBlock() {
  const target = getTarget();
  if (!target) return;
  const blockId = getSelectedBlockId();
  if (!blockId) return;
  const center = new THREE.Vector3(target.bx + 0.5, target.by + 0.5, target.bz + 0.5);
  const rel = target.hit.point.clone().sub(center);
  const ax = Math.abs(rel.x);
  const ay = Math.abs(rel.y);
  const az = Math.abs(rel.z);
  let nx = 0, ny = 0, nz = 0;
  if (ax >= ay && ax >= az) nx = Math.sign(rel.x);
  else if (ay >= ax && ay >= az) ny = Math.sign(rel.y);
  else nz = Math.sign(rel.z);

  const px = target.bx + nx;
  const py = target.by + ny;
  const pz = target.bz + nz;
  if (py < 0) return;
  if (py >= CHUNK_HEIGHT) {
    showText('You are at the build limit! Cannot place.', '#ff5555');
    return;
  }
  if (hasBlock(px, py, pz)) return;
  if (blockIntersectsPlayer(px, py, pz)) return;

  addBlock(px, py, pz, blockId);
  rebuildChunk(px, pz);
  playBlockPlaceSound(blockId);
}

export function updateOutline() {
  const target = getTarget();
  if (target) {
    outline.position.set(target.bx + 0.5, target.by + 0.5, target.bz + 0.5);
    outline.visible = true;
  } else {
    outline.visible = false;
  }
}
