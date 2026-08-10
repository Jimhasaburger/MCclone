import * as THREE from 'three';
import { DATA_VERSION, CLOUD_HEIGHT } from './config.js';

const CLOUD_TEXTURE = `assets/textures/envirnoment/clouds.png?v=${DATA_VERSION}`;
const TILE_SIZE = 120;
const PLANE_SIZE = 900;
const FADE_NEAR = 90;
const FADE_FAR = 300;
const DRIFT_SPEED = 0.5;

let sceneRef;
let cloudGroup;
let cloudMaterial;
let driftBlocks = 0;

export async function initClouds(scene) {
  sceneRef = scene;

  const texture = await loadCloudTexture();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;

  cloudMaterial = new THREE.ShaderMaterial({
    uniforms: {
      cloudMap: { value: texture },
      uRepeat: { value: PLANE_SIZE / TILE_SIZE },
      uOffset: { value: new THREE.Vector2(0, 0) },
      uCamXZ: { value: new THREE.Vector3() },
      uFadeNear: { value: FADE_NEAR },
      uFadeFar: { value: FADE_FAR },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D cloudMap;
      uniform float uRepeat;
      uniform vec2 uOffset;
      uniform vec3 uCamXZ;
      uniform float uFadeNear;
      uniform float uFadeFar;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vec2 uv = fract(vUv * uRepeat + uOffset);
        float a = texture2D(cloudMap, uv).a;
        if (a < 0.05) discard;
        float dist = length(vWorld.xz - uCamXZ.xz);
        float fade = 1.0 - smoothstep(uFadeNear, uFadeFar, dist);
        gl_FragColor = vec4(1.0, 1.0, 1.0, a * fade);
      }
    `,
  });

  const geometry = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
  cloudGroup = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, cloudMaterial);
  mesh.rotation.x = -Math.PI / 2;
  cloudGroup.add(mesh);
  sceneRef.add(cloudGroup);
}

function loadCloudTexture() {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(CLOUD_TEXTURE, resolve, undefined, reject);
  });
}

export function updateClouds(dt, px, pz) {
  if (!cloudGroup) return;
  driftBlocks += DRIFT_SPEED * dt;
  const tileBlocks = driftBlocks / TILE_SIZE;
  cloudGroup.position.set(px, CLOUD_HEIGHT, pz);
  cloudMaterial.uniforms.uOffset.value.x = tileBlocks;
  cloudMaterial.uniforms.uCamXZ.value.set(px, 0, pz);
}