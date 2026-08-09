import * as THREE from 'three';
import { loadTextures } from './textures.js';
import { initWorld, updateChunks, isWorldReady } from './world.js';
import { initPlayer, updatePlayer, isPlayerSpawned } from './player.js';
import { initBlocks, updateOutline } from './blocks.js';
import { initUI, setFPS, hideLoading, refreshHotbar } from './ui.js';
import { initSaveControls, clearSavedChunks, getSavedSeed, saveSeed } from './save.js';
import { reloadWorld, saveAllLoadedChunks } from './world.js';
import { setSeed, newSeed, getSeed } from './noise.js';
import { loadSounds } from './sounds.js';
import { loadTreeDefs } from './worldgen.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc0d9e8);
scene.fog = new THREE.Fog(0xc0d9e8, 24, 40);

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
Promise.all([loadTextures(), loadSounds(), loadTreeDefs(), restoreSeed()]).then(() => {
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
