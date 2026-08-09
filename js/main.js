import * as THREE from 'three';
import { loadTextures } from './textures.js';
import { initWorld, updateChunks, isWorldReady } from './world.js';
import { initPlayer, updatePlayer, isPlayerSpawned, playerPos } from './player.js';
import { initBlocks, updateOutline } from './blocks.js';
import { initUI, setFPS, setCoords, hideLoading } from './ui.js';
import { initHotbar, refreshHotbar } from './hotbar.js';
import { initInventory } from './inventory.js';
import { initSaveControls, clearSavedChunks, getSavedSeed, saveSeed } from './save.js';
import { reloadWorld, saveAllLoadedChunks } from './world.js';
import { setSeed, newSeed, getSeed } from './noise.js';
import { loadSounds, initMusic } from './sounds.js';
import { loadWorldgen } from './worldgen.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc0d9e8);
scene.fog = new THREE.Fog(0xc0d9e8, 30, 70);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(10, 15, 10);
scene.add(directionalLight);

initWorld(scene, camera);
initUI(renderer.domElement);
initHotbar();
initInventory(renderer.domElement);
initPlayer(camera, renderer.domElement);
initBlocks(scene, camera, renderer.domElement);
initSaveControls(
  async ({ seed }) => {
    if (seed !== null) {
      setSeed(seed);
      await saveSeed(seed);
    }
    reloadWorld();
  },
  () => {
    const seed = newSeed();
    setSeed(seed);
    clearSavedChunks().then(() => {
      saveSeed(seed);
      reloadWorld();
    });
  }
);
Promise.all([loadTextures(), loadSounds(), initMusic(), loadWorldgen(), restoreSeed()]).then(() => {
  refreshHotbar();
  updateChunks();
  waitForReady();
});

async function restoreSeed() {
  const saved = await getSavedSeed();
  setSeed(saved === null ? 0 : saved);
}

function waitForReady() {
  if (isWorldReady() && isPlayerSpawned()) {
    hideLoading();
  } else {
    requestAnimationFrame(waitForReady);
  }
}

window.addEventListener('beforeunload', saveAllLoadedChunks);

// --- FPS counter ---
let frameCount = 0;
let lastFpsTime = performance.now();

let tick = 0;
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  updatePlayer(dt);
  updateOutline();
  setCoords(playerPos.x, playerPos.y, playerPos.z);

  frameCount++;
  if (now - lastFpsTime >= 500) {
    setFPS(Math.round((frameCount * 1000) / (now - lastFpsTime)));
    frameCount = 0;
    lastFpsTime = now;
  }

  tick++;
  if (tick % 10 === 0) updateChunks();

  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
