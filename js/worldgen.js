import { CHUNK_SIZE, CHUNK_HEIGHT } from './config.js';
import { getHeight, rand2D, setNoiseConfig } from './noise.js';
import { getBlockDefs } from './textures.js';

let treeDefs = [];
let cfg = null;
let idsByName = new Map();
let replaceIds = new Set();
let waterBlock = null;
let idsResolved = false;

export async function loadWorldgen() {
  const [main, small, big] = await Promise.all([
    fetch('assets/data/worldgen/main.json').then(r => r.json()),
    fetch('assets/data/structures/trees/small.json').then(r => r.json()),
    fetch('assets/data/structures/trees/big.json').then(r => r.json()),
  ]);
  cfg = main;
  if (cfg.noise) setNoiseConfig(cfg.noise);
  treeDefs = [small, big]
    .filter(t => t && t.chance > 0)
    .sort((a, b) => b.chance - a.chance);
}

function ensureIds() {
  if (idsResolved) return;
  const defs = getBlockDefs();
  if (defs.length === 0) return;
  idsByName = new Map(defs.map(d => [d.name, d.id]));
  replaceIds = new Set();
  for (const name of ['stone', 'dirt']) {
    const id = idsByName.get(name);
    if (id) replaceIds.add(id);
  }
  waterBlock = defs.find(d => typeof d.waterLevel === 'number') || null;
  idsResolved = true;
}

function blockIdAtLayer(layers, layer) {
  for (const l of layers) {
    if (layer <= l.top && layer >= l.bottom) return l.id;
  }
  return layers.length ? layers[layers.length - 1].id : 1;
}

export function generateTerrain(cx, cz, grid) {
  ensureIds();
  if (!cfg) return;
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;

  const bedrockId = cfg.bedrock ? idsByName.get(cfg.bedrock) || 0 : 0;
  const landId = cfg.surface ? idsByName.get(cfg.surface) || 0 : 0;
  const waterId = waterBlock ? waterBlock.id : 0;
  const waterLevel = waterBlock ? waterBlock.waterLevel : 0;
  const layers = (cfg.layers || [])
    .map(l => ({ id: idsByName.get(l.block) || 0, top: l.top, bottom: l.bottom }))
    .filter(l => l.id)
    .sort((a, b) => b.top - a.top);
  const surface = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const h = getHeight(ox + lx, oz + lz);
      const base = (lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT;
      const submerged = waterId && waterLevel > 0 && h - 1 < waterLevel;
      const surfaceId = submerged ? waterId : landId;

      for (let y = 0; y < h; y++) {
        let id;
        if (bedrockId && y === 0) {
          id = bedrockId;
        } else if (y === h - 1) {
          id = surfaceId;
        } else {
          id = blockIdAtLayer(layers, y - h + 2);
        }
        grid[base + y] = id;
      }

      if (submerged) {
        for (let y = h; y < waterLevel; y++) grid[base + y] = waterId;
      }
      surface[lx * CHUNK_SIZE + lz] = h - 1;
    }
  }

  generateOres(grid, ox, oz);
  generateTrees(grid, ox, oz, surface);
}

function generateOres(grid, ox, oz) {
  for (const def of getBlockDefs()) {
    const ore = def.ore;
    if (!ore) continue;
    const spacing = ore.spacing || 8;
    const r = ore.veinSize || 4;
    const margin = Math.ceil((CHUNK_SIZE + r) / spacing) + 1;
    const x0 = Math.floor(ox / spacing);
    const x1 = Math.floor((ox + CHUNK_SIZE - 1) / spacing);
    const z0 = Math.floor(oz / spacing);
    const z1 = Math.floor((oz + CHUNK_SIZE - 1) / spacing);
    for (let cz = z0 - margin; cz <= z1 + margin; cz++) {
      for (let cx = x0 - margin; cx <= x1 + margin; cx++) {
        if (rand2D(cx * 3 + 11, cz * 5 + 7) >= (ore.rarity || 0.2)) continue;
        const vx = cx * spacing + Math.floor(rand2D(cx * 7 + 1, cz * 11 + 1) * spacing);
        const vz = cz * spacing + Math.floor(rand2D(cx * 13 + 1, cz * 17 + 1) * spacing);
        const h = getHeight(vx, vz);
        const minY = h + ore.minLayer;
        const maxY = h + ore.maxLayer;
        if (minY >= maxY) continue;
        const vy = minY + Math.floor(rand2D(cx * 19 + 1, cz * 23 + 1) * (maxY - minY + 1));
        placeVein(grid, ox, oz, vx, vy, vz, r, def.id);
      }
    }
  }
}

function placeVein(grid, ox, oz, vx, vy, vz, r, id) {
  for (let dy = -r; dy <= r; dy++) {
    const wy = vy + dy;
    if (wy < 0 || wy >= CHUNK_HEIGHT) continue;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dy * dy + dz * dz > r * r + 0.5) continue;
        const wx = vx + dx;
        const wz = vz + dz;
        const lx = wx - ox;
        const lz = wz - oz;
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
        const base = (lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT;
        if (replaceIds.has(grid[base + wy])) grid[base + wy] = id;
      }
    }
  }
}

function rollTree(wx, wz) {
  for (let di = 0; di < treeDefs.length; di++) {
    const def = treeDefs[di];
    const r = rand2D(wx * 3 + di * 7, wz * 5 + di * 11);
    if (r * 100 < def.chance) return def;
  }
  return null;
}

function maxTreeRadius() {
  return Math.max(
    1,
    ...treeDefs.map(d => ((d.leaves && d.leaves.radius) || 2) + Math.floor(((d.trunkWidth || 1) - 1) / 2))
  ) + 1;
}

function placeLocal(grid, ox, oz, wx, y, wz, id) {
  if (y < 0 || y >= CHUNK_HEIGHT) return;
  const lx = wx - ox;
  const lz = wz - oz;
  if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
  const base = (lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT;
  if (grid[base + y] !== 0) return;
  grid[base + y] = id;
}

function placeTree(grid, ox, oz, wx, groundY, wz, def) {
  const logId = idsByName.get('log') || 0;
  const leafId = idsByName.get('leaves') || 0;
  if (!logId || !leafId) return;
  const trunkMin = Math.min(def.trunkHeight[0], def.trunkHeight[1]);
  const trunkMax = Math.max(def.trunkHeight[0], def.trunkHeight[1]);
  const trunkHeight = trunkMin + Math.floor(rand2D(wx * 13, wz * 17) * (trunkMax - trunkMin + 1));
  const lv = def.leaves || {};
  const radius = lv.radius || 2;
  const topRadius = lv.topRadius || 1;
  const leafHeight = lv.height || 2;
  const width = Math.max(1, def.trunkWidth || 1);
  const half = Math.floor(width / 2);
  const trunkTopY = groundY + trunkHeight;

  for (let dx = 0; dx < width; dx++) {
    for (let dz = 0; dz < width; dz++) {
      for (let y = groundY + 1; y <= trunkTopY; y++) {
        placeLocal(grid, ox, oz, wx + dx, y, wz + dz, logId);
      }
    }
  }

  for (let layer = 0; layer < leafHeight; layer++) {
    const r = Math.max(topRadius, radius - layer);
    const y = trunkTopY + layer;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > (r + 0.5) * (r + 0.5)) continue;
        placeLocal(grid, ox, oz, wx + half + dx, y, wz + half + dz, leafId);
      }
    }
  }
  placeLocal(grid, ox, oz, wx + half, trunkTopY + leafHeight, wz + half, leafId);
}

function generateTrees(grid, ox, oz, surface) {
  if (!treeDefs.length) return;
  const reach = maxTreeRadius();
  const grassId = idsByName.get('grass') || 0;
  const dirtId = idsByName.get('dirt') || 0;

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = ox + lx;
      const wz = oz + lz;
      const groundY = surface[lx * CHUNK_SIZE + lz];
      const groundId = grid[(lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT + groundY];
      if (groundId !== grassId && groundId !== dirtId) continue;
      const def = rollTree(wx, wz);
      if (def) placeTree(grid, ox, oz, wx, groundY, wz, def);
    }
  }

  for (let dx = -reach; dx < CHUNK_SIZE + reach; dx++) {
    for (let dz = -reach; dz < CHUNK_SIZE + reach; dz++) {
      if (dx >= 0 && dx < CHUNK_SIZE && dz >= 0 && dz < CHUNK_SIZE) continue;
      const wx = ox + dx;
      const wz = oz + dz;
      const def = rollTree(wx, wz);
      if (!def) continue;
      const groundY = getHeight(wx, wz) - 1;
      placeTree(grid, ox, oz, wx, groundY, wz, def);
    }
  }
}
