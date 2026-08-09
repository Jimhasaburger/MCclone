import * as THREE from 'three';
import { PLAYER_HEIGHT, CHUNK_HEIGHT } from './config.js';
import { collidesAt, isSolid } from './world.js';

export const playerPos = new THREE.Vector3(0, 10, 0);

const playerVel = new THREE.Vector3(0, 0, 0);
let onGround = false;
let spawned = false;
const gravity = -20;
const jumpSpeed = 7;

const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const keys = { w: false, a: false, s: false, d: false, shift: false };
const moveSpeed = 6;
const acceleration = 30;
const friction = 25;
const sensitivity = 0.002;

const forward = new THREE.Vector3();
const right = new THREE.Vector3();

let camera;

function snapToSurface() {
  if (spawned) return;
  const bx = Math.floor(playerPos.x);
  const bz = Math.floor(playerPos.z);
  for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
    if (isSolid(bx, y, bz)) {
      playerPos.y = y + 1;
      playerVel.y = 0;
      spawned = true;
      return;
    }
  }
}

export function initPlayer(cameraRef, domElement) {
  camera = cameraRef;

  document.addEventListener('keydown', e => {
    if (e.code === 'KeyW') keys.w = true;
    if (e.code === 'KeyA') keys.a = true;
    if (e.code === 'KeyS') keys.s = true;
    if (e.code === 'KeyD') keys.d = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.shift = true;
    if (e.code === 'Space') {
      e.preventDefault();
      if (onGround) {
        playerVel.y = jumpSpeed;
      }
    }
  });
  document.addEventListener('keyup', e => {
    if (e.code === 'KeyW') keys.w = false;
    if (e.code === 'KeyA') keys.a = false;
    if (e.code === 'KeyS') keys.s = false;
    if (e.code === 'KeyD') keys.d = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.shift = false;
  });

  domElement.addEventListener('click', () => domElement.requestPointerLock());

  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== domElement) return;
    euler.setFromQuaternion(camera.quaternion);
    euler.y -= e.movementX * sensitivity;
    euler.x -= e.movementY * sensitivity;
    euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
    camera.quaternion.setFromEuler(euler);
  });
}

export function isPlayerSpawned() {
  return spawned;
}

export function updatePlayer(dt) {
  snapToSurface();

  camera.getWorldDirection(forward);
  right.crossVectors(forward, camera.up).normalize();
  forward.y = 0;
  forward.normalize();

  const move = new THREE.Vector3();
  if (keys.w) move.add(forward);
  if (keys.s) move.sub(forward);
  if (keys.d) move.add(right);
  if (keys.a) move.sub(right);
  if (move.length() > 0) move.normalize().multiplyScalar(moveSpeed * (keys.shift ? 2 : 1));

  const accel = move.length() > 0 ? acceleration : friction;
  const factor = 1 - Math.exp(-accel * dt);
  playerVel.x += (move.x - playerVel.x) * factor;
  playerVel.z += (move.z - playerVel.z) * factor;
  playerVel.y += gravity * dt;

  onGround = false;

  playerPos.x += playerVel.x * dt;
  if (playerVel.x !== 0 && collidesAt(playerPos.x, playerPos.y, playerPos.z)) {
    playerPos.x -= playerVel.x * dt;
    playerVel.x = 0;
  }

  playerPos.z += playerVel.z * dt;
  if (playerVel.z !== 0 && collidesAt(playerPos.x, playerPos.y, playerPos.z)) {
    playerPos.z -= playerVel.z * dt;
    playerVel.z = 0;
  }

  playerPos.y += playerVel.y * dt;
  if (playerVel.y !== 0 && collidesAt(playerPos.x, playerPos.y, playerPos.z)) {
    if (playerVel.y < 0) {
      playerPos.y = Math.floor(playerPos.y) + 1;
      onGround = true;
    } else {
      playerPos.y = Math.floor(playerPos.y + PLAYER_HEIGHT) - PLAYER_HEIGHT;
    }
    playerVel.y = 0;
  }

  camera.position.copy(playerPos);
  camera.position.y += 1.8;
}
