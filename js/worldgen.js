import { CHUNK_SIZE, CHUNK_HEIGHT, DATA_VERSION } from './config.js';
import { getHeight, rand2D, setHeightConfig } from './noise.js';

let treeDefs = [];
let cfg = null;

export async function loadWorldgen() {
  const [main, small, big] = await Promise.all([
    fetch(`assets/data/worldgen/main.json?v=${DATA_VERSION}`).then(r => r.json()),
    fetch(`assets/data/structures/trees/small.json?v=${DATA_VERSION}`).then(r => r.json()),
    fetch(`assets/data/structures/trees/big.json?v=${DATA_VERSION}`).then(r => r.json()),
  ]);
  cfg = main;
  if (cfg.height) setHeightConfig(cfg.height);
  treeDefs = [small, big]
    .filter(t => t && t.chance > 0)
    .sort((a, b) => b.chance - a.chance);
}

function randInt(min, max, wx, wz) {
  return min + Math.floor(rand2D(wx * 17 + 3, wz * 29 + 5) * (max - min + 1));
}

export function generateTerrain(cx, cz, grid) {
  if (!cfg) return;
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;

  const bedrock = cfg.bedrock || {};
  const bedrockId = bedrock.block || 0;
  const flatTop = bedrock.flatTop || 1;
  const patchyTop = bedrock.patchyTop || flatTop;
  const patchDensity = bedrock.patchDensity || 0.55;
  const surfaceId = cfg.surface || 0;
  const fillId = cfg.fill || 0;
  const layers = (cfg.layers || [])
    .map(l => ({ id: l.block || 0, thickness: l.thickness }))
    .filter(l => l.id);
  const groundIds = new Set([surfaceId, ...layers.map(l => l.id)]);
  const veins = cfg.veins || [];
  const surface = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = ox + lx;
      const wz = oz + lz;
      const h = getHeight(wx, wz);
      const base = (lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT;

      for (let y = 0; y < flatTop; y++) grid[base + y] = bedrockId;
      for (let y = flatTop; y < patchyTop; y++) {
        if (rand2D(wx * 31 + y * 7, wz * 37 + y * 13) < patchDensity) grid[base + y] = bedrockId;
      }

      let y = h;
      grid[base + y] = surfaceId;
      y--;
      for (const layer of layers) {
        const t = randInt(layer.thickness[0], layer.thickness[1], wx, wz);
        for (let i = 0; i < t && y >= patchyTop; i++) {
          grid[base + y] = layer.id;
          y--;
        }
      }
      while (y >= patchyTop) {
        grid[base + y] = fillId;
        y--;
      }
      surface[lx * CHUNK_SIZE + lz] = h;
    }
  }

  generateTrees(grid, ox, oz, surface, groundIds);
  generateVeins(grid, ox, oz, veins, fillId);
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
    ...treeDefs.map(d => ((d.canopy && d.canopy.radius) || 2) + Math.floor(((d.trunkWidth || 1) - 1) / 2))
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

function setLocal(grid, ox, oz, wx, y, wz, id, targetId) {
  if (y < 0 || y >= CHUNK_HEIGHT) return;
  const lx = wx - ox;
  const lz = wz - oz;
  if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
  const idx = (lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT + y;
  if (grid[idx] !== targetId) return;
  grid[idx] = id;
}

function generateVeins(grid, ox, oz, veins, fillId) {
  for (const v of veins) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = ox + lx;
        const wz = oz + lz;
        if (rand2D(wx * 1.3 + v.block * 0.7, wz * 1.9 + v.block * 3.1) >= v.chance) continue;
        const size = v.size[0] + Math.floor(rand2D(wx * 0.5, wz * 0.9) * (v.size[1] - v.size[0] + 1));
        let vx = wx;
        let vy = v.minY + Math.floor(rand2D(wx * 2.3, wz * 2.7) * (v.maxY - v.minY + 1));
        let vz = wz;
        for (let s = 0; s < size; s++) {
          setLocal(grid, ox, oz, vx, vy, vz, v.block, fillId);
          const dir = Math.floor(rand2D(vx * 3.7 + s, vz * 5.9 + s) * 6);
          if (dir === 0) vy++;
          else if (dir === 1) vy--;
          else if (dir === 2) vx++;
          else if (dir === 3) vx--;
          else if (dir === 4) vz++;
          else vz--;
          vy = Math.max(v.minY, Math.min(v.maxY, vy));
        }
      }
    }
  }
}

function placeTree(grid, ox, oz, wx, groundY, wz, def) {
  const blocks = def.blocks || {};
  const logId = blocks.log || 0;
  const leafId = blocks.leaves || 0;
  if (!logId || !leafId) return;
  const trunkMin = Math.min(def.trunkHeight[0], def.trunkHeight[1]);
  const trunkMax = Math.max(def.trunkHeight[0], def.trunkHeight[1]);
  const trunkHeight = trunkMin + Math.floor(rand2D(wx * 13, wz * 17) * (trunkMax - trunkMin + 1));
  const canopy = def.canopy || {};
  const radius = canopy.radius || 2;
  const topRadius = canopy.topRadius || 1;
  const leafHeight = canopy.height || 2;
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

function generateTrees(grid, ox, oz, surface, groundIds) {
  if (!treeDefs.length) return;
  const reach = maxTreeRadius();

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = ox + lx;
      const wz = oz + lz;
      const groundY = surface[lx * CHUNK_SIZE + lz];
      const groundId = grid[(lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT + groundY];
      if (!groundIds.has(groundId)) continue;
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
      const groundY = getHeight(wx, wz);
      placeTree(grid, ox, oz, wx, groundY, wz, def);
    }
  }
}
