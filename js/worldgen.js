import { CHUNK_SIZE, CHUNK_HEIGHT } from './config.js';
import { getHeight, rand2D } from './noise.js';
import { getBlockDefs } from './textures.js';

let treeDefs = [];

export async function loadTreeDefs() {
  const [small, big] = await Promise.all([
    fetch('assets/data/structures/trees/small.json').then(r => r.json()),
    fetch('assets/data/structures/trees/big.json').then(r => r.json()),
  ]);
  treeDefs = [small, big]
    .filter(t => t && t.chance > 0)
    .sort((a, b) => b.chance - a.chance);
}

function defId(defs, name) {
  const d = defs.find(x => x.name === name);
  return d ? d.id : 0;
}

const ids = { log: 0, leaves: 0, grass: 0, dirt: 0 };
let idsResolved = false;

function ensureBlockIds() {
  if (idsResolved) return;
  const defs = getBlockDefs();
  if (defs.length === 0) return;
  ids.log = defId(defs, 'log');
  ids.leaves = defId(defs, 'leaves');
  ids.grass = defId(defs, 'grass');
  ids.dirt = defId(defs, 'dirt');
  idsResolved = true;
}

function lockedBlockDef(defs) {
  let best = null;
  for (const def of defs) {
    if (def.locktosety && (!best || Math.min(...def.layers) < Math.min(...best.layers))) best = def;
  }
  return best;
}

function fillBlockId(defs) {
  let best = null;
  for (const def of defs) {
    if (def.locktosety) continue;
    if (!best || Math.min(...def.layers) < Math.min(...best.layers)) best = def;
  }
  return best ? best.id : 0;
}

function blockIdAtLayer(defs, layer) {
  for (const def of defs) {
    if (def.layers.includes(layer)) return def.id;
  }
  let below = null;
  let belowMin = -Infinity;
  for (const def of defs) {
    const min = Math.min(...def.layers);
    if (min < layer && min > belowMin) {
      belowMin = min;
      below = def;
    }
  }
  if (below) return below.id;
  let deepest = null;
  for (const def of defs) {
    if (!deepest || Math.min(...def.layers) < Math.min(...deepest.layers)) deepest = def;
  }
  return deepest ? deepest.id : 1;
}

export function generateTerrain(cx, cz, grid) {
  ensureBlockIds();
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const defs = getBlockDefs();
  const locked = lockedBlockDef(defs);
  const lockedId = locked ? locked.id : 0;
  const lockedFloorY = locked ? locked.layer : 0;
  const fillId = fillBlockId(defs);
  const surface = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const h = getHeight(ox + lx, oz + lz);
      const base = (lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT;
      for (let y = 0; y < h; y++) {
        let id;
        if (lockedId && y < lockedFloorY) {
          id = lockedId;
        } else {
          id = blockIdAtLayer(defs, y - h + 2);
          if (lockedId && id === lockedId) id = fillId;
        }
        grid[base + y] = id;
      }
      surface[lx * CHUNK_SIZE + lz] = h - 1;
    }
  }

  generateTrees(grid, ox, oz, surface);
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
        placeLocal(grid, ox, oz, wx + dx, y, wz + dz, ids.log);
      }
    }
  }

  for (let layer = 0; layer < leafHeight; layer++) {
    const r = Math.max(topRadius, radius - layer);
    const y = trunkTopY + layer;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > (r + 0.5) * (r + 0.5)) continue;
        placeLocal(grid, ox, oz, wx + half + dx, y, wz + half + dz, ids.leaves);
      }
    }
  }
  placeLocal(grid, ox, oz, wx + half, trunkTopY + leafHeight, wz + half, ids.leaves);
}

function generateTrees(grid, ox, oz, surface) {
  if (!treeDefs.length || !ids.log || !ids.leaves) return;
  const reach = maxTreeRadius();

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = ox + lx;
      const wz = oz + lz;
      const groundY = surface[lx * CHUNK_SIZE + lz];
      const groundId = grid[(lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT + groundY];
      if (groundId !== ids.grass && groundId !== ids.dirt) continue;
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
