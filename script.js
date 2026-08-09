import * as THREE from 'three';

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

// --- Block outline ---
const outlineGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
const outlineMat = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false });
const outline = new THREE.LineSegments(outlineGeo, outlineMat);
outline.visible = false;
scene.add(outline);

const raycaster = new THREE.Raycaster();

// --- Noise ---
function hash2D(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) / 2147483647;
}

function smoothNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash2D(ix, iy);
  const n10 = hash2D(ix + 1, iy);
  const n01 = hash2D(ix, iy + 1);
  const n11 = hash2D(ix + 1, iy + 1);
  return n00 * (1 - sx) * (1 - sy) + n10 * sx * (1 - sy) + n01 * (1 - sx) * sy + n11 * sx * sy;
}

function fbm(x, y, octaves = 3) {
  let value = 0;
  let amp = 1;
  let freq = 1;
  let totalAmp = 0;
  for (let i = 0; i < octaves; i++) {
    value += amp * smoothNoise(x * freq, y * freq);
    totalAmp += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return value / totalAmp;
}

function getHeight(wx, wz) {
  const n = fbm(wx * 0.025, wz * 0.025);
  return Math.floor(n * 8 + 4);
}

// --- Chunk system ---
const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 64;
const RENDER_DISTANCE = 4;

const chunks = new Map();
const blockMap = new Set();
const dummy = new THREE.Object3D();
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0x7c9c6e });
const materials = [
  fallbackMaterial,
  fallbackMaterial,
  fallbackMaterial,
  fallbackMaterial,
  fallbackMaterial,
  fallbackMaterial,
];
const loader = new THREE.TextureLoader();
const FACE_ORDER = ['east', 'west', 'top', 'bottom', 'north', 'south'];

async function loadTextures() {
  try {
    const res = await fetch('textures.json');
    const data = await res.json();
    const sides = data.sides;
    await Promise.all(
      FACE_ORDER.map(async (name, i) => {
        const url = sides[name];
        if (!url) return;
        const tex = await loader.loadAsync(url);
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
  } finally {
    const loading = document.getElementById('loading');
    if (loading) loading.remove();
  }
}
loadTextures();

function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

function blockKey(x, y, z) {
  return `${x},${y},${z}`;
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
      const h = getHeight(wx, wz);
      for (let y = 0; y < h; y++) {
        positions.push(lx + 0.5, y + 0.5, lz + 0.5);
        worldPositions.push(wx, y, wz);
        blockMap.add(blockKey(wx, y, wz));
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

function updateChunks() {
  const cx = Math.floor(camera.position.x / CHUNK_SIZE);
  const cz = Math.floor(camera.position.z / CHUNK_SIZE);
  const needed = new Set();

  for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
    for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
      const key = chunkKey(cx + dx, cz + dz);
      needed.add(key);
      if (!chunks.has(key)) {
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
      chunks.delete(key);
    }
  }
}

function isSolid(wx, wy, wz) {
  if (wy < 0 || wy >= CHUNK_HEIGHT) return false;
  return blockMap.has(blockKey(Math.floor(wx), wy, Math.floor(wz)));
}

// --- Player ---
const playerHeight = 2;
const playerPos = new THREE.Vector3(0, 10, 0);
const playerVel = new THREE.Vector3(0, 0, 0);
let onGround = false;
const gravity = -20;
const jumpSpeed = 7;
const playerSize = 0.5;

function collidesAt(wx, wy, wz) {
  const y0 = wy;
  const y1 = wy + playerHeight;
  const r2 = playerSize * playerSize;
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

updateChunks();

// --- Freecam ---
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const keys = { w: false, a: false, s: false, d: false, shift: false };
const moveSpeed = 6;
const acceleration = 30;
const friction = 25;
const sensitivity = 0.002;

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

renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock());

document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement) return;
  euler.setFromQuaternion(camera.quaternion);
  euler.y -= e.movementX * sensitivity;
  euler.x -= e.movementY * sensitivity;
  euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
  camera.quaternion.setFromEuler(euler);
});

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
let tick = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, 1 / 60);

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

  // Move X, check collision
  playerPos.x += playerVel.x * dt;
  if (playerVel.x !== 0 && collidesAt(playerPos.x, playerPos.y, playerPos.z)) {
    playerPos.x -= playerVel.x * dt;
    playerVel.x = 0;
  }

  // Move Z, check collision
  playerPos.z += playerVel.z * dt;
  if (playerVel.z !== 0 && collidesAt(playerPos.x, playerPos.y, playerPos.z)) {
    playerPos.z -= playerVel.z * dt;
    playerVel.z = 0;
  }

  // Move Y, check collision
  playerPos.y += playerVel.y * dt;
  if (playerVel.y !== 0 && collidesAt(playerPos.x, playerPos.y, playerPos.z)) {
    if (playerVel.y < 0) {
      playerPos.y = Math.floor(playerPos.y) + 1;
      onGround = true;
    } else {
      playerPos.y = Math.ceil(playerPos.y + playerHeight) - playerHeight - 0.001;
    }
    playerVel.y = 0;
  }

  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const intersects = raycaster.intersectObjects([...chunks.values()].filter(m => m));
  if (intersects.length > 0) {
    const hit = intersects[0];
    const mesh = hit.object;
    const idx = hit.instanceId;
    const bp = mesh.userData.blockPositions;
    if (bp && idx !== undefined) {
      const bx = bp[idx * 3];
      const by = bp[idx * 3 + 1];
      const bz = bp[idx * 3 + 2];
      outline.position.set(bx + 0.5, by + 0.5, bz + 0.5);
      outline.visible = true;
    }
  } else {
    outline.visible = false;
  }

  camera.position.copy(playerPos);
  camera.position.y += 1.8;

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