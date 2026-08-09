import { DATA_VERSION } from './config.js';

const SOUNDS_FILE = 'assets/sounds/blocks/sounds.json';

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const soundSets = new Map();
const blockSounds = new Map();

export async function loadSounds() {
  try {
    const res = await fetch(`${SOUNDS_FILE}?v=${DATA_VERSION}`);
    const data = await res.json();
    await Promise.all(
      Object.entries(data.soundsets || {}).map(async ([name, set]) => {
        const dig = (
          await Promise.all(
            (set.dig || []).map(async src => {
              try {
                const buf = await fetch(src).then(r => r.arrayBuffer());
                return await audioCtx.decodeAudioData(buf);
              } catch (e) {
                console.warn('Failed to load sound', src, e);
                return null;
              }
            })
          )
        ).filter(Boolean);
        soundSets.set(name, { dig });
      })
    );
    for (const [id, name] of Object.entries(data.blocks || {})) {
      blockSounds.set(Number(id), name);
    }
  } catch (e) {
    console.error('Failed to load sound definitions', e);
  }
}

function playSet(name) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const set = soundSets.get(name);
  if (!set || set.dig.length === 0) return;
  const buffer = set.dig[Math.floor(Math.random() * set.dig.length)];
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(audioCtx.destination);
  src.start();
}

export function playBlockDigSound(blockId) {
  const name = blockSounds.get(blockId);
  if (name) playSet(name);
}

export function playBlockPlaceSound(blockId) {
  playBlockDigSound(blockId);
}
