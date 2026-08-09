import { DATA_VERSION } from './config.js';
import { setSong } from './ui.js';

const SOUNDS_FILE = 'assets/sounds/blocks/sounds.json';
const AMBIENT_FILE = 'assets/sounds/ambient/songs.json';

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

const musicEl = new Audio();
let songList = [];
let musicOn = false;
let musicTimer = null;

export async function initMusic() {
  try {
    const res = await fetch(`${AMBIENT_FILE}?v=${DATA_VERSION}`);
    const data = await res.json();
    songList = data.songs || [];
  } catch (e) {
    console.error('Failed to load ambient music list', e);
  }
  musicEl.addEventListener('ended', onSongEnd);
  document.addEventListener('keydown', e => {
    if (e.code === 'KeyM') toggleMusic();
  });
  if (musicOn) playRandomSong();
}

export function toggleMusic() {
  musicOn = !musicOn;
  if (musicOn) {
    playRandomSong();
  } else {
    clearTimeout(musicTimer);
    setSong('');
    musicEl.pause();
    musicEl.currentTime = 0;
  }
  return musicOn;
}

function playRandomSong() {
  if (!musicOn || songList.length === 0) return;
  const song = songList[Math.floor(Math.random() * songList.length)];
  musicEl.src = song.src;
  musicEl.volume = 0.7;
  setSong(`Now playing: ${song.name}`);
  musicEl.play().catch(() => {});
}

function onSongEnd() {
  if (!musicOn) return;
  const gap = 20000 + Math.random() * 60000;
  clearTimeout(musicTimer);
  musicTimer = setTimeout(playRandomSong, gap);
}
