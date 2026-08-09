let seed = 0;
let seedReady = false;

let heightCfg = {
  seaLevel: 63,
  oceanThreshold: 0.48,
  oceanFloor: 46,
  continentScale: 0.02,
  detailScale: 0.08,
  landBase: 66,
  detailAmplitude: 4,
  hillScale: 0.04,
  hillAmplitude: 5,
  mountainThreshold: 0.52,
  mountainAmplitude: 60,
};

export function setSeed(s) {
  seed = s >>> 0;
  seedReady = true;
}

export function getSeed() {
  return seed;
}

export function isSeedReady() {
  return seedReady;
}

export function newSeed() {
  return Math.floor(Math.random() * 0x7fffffff);
}

export function setHeightConfig(cfg) {
  heightCfg = { ...heightCfg, ...cfg };
}

function hash2D(x, y) {
  let h = x * 374761393 + y * 668265263 + seed * 1103515245;
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

function fbm(x, y, octaves = 4) {
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

export function noise2D(x, z, scale, octaves = 3) {
  return fbm(x * scale, z * scale, octaves);
}

export function getHeight(wx, wz) {
  const c = heightCfg;
  const continent = fbm(wx * c.continentScale, wz * c.continentScale);
  const detail = fbm(wx * c.detailScale, wz * c.detailScale);

  if (continent < c.oceanThreshold) {
    return Math.floor(c.oceanFloor + (continent / c.oceanThreshold) * 16 + (detail - 0.5) * 4);
  }

  const hill = fbm(wx * c.hillScale + 100, wz * c.hillScale + 100);
  let base = c.landBase + (detail - 0.5) * c.detailAmplitude + (hill - 0.5) * c.hillAmplitude;
  if (hill > c.mountainThreshold) {
    base += ((hill - c.mountainThreshold) / (1 - c.mountainThreshold)) * c.mountainAmplitude;
  }
  return Math.floor(base);
}

export function rand2D(x, z) {
  let h = x * 374761393 + z * 668265263 + seed * 1103515245;
  h = Math.imul(h ^ (h >>> 16), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
