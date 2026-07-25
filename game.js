import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

/* ==========================================================================
   Game State & Configuration
   ========================================================================== */
const state = {
  mode: 'MENU', // 'MENU', 'PLAYING', 'GAME_OVER'
  
  // Air Pressure & Balloon Status
  airPressure: 100, // 0 to 100%
  drainRate: 2.5,   // Air loss per second
  
  // Game Stats
  score: 0,
  survivalTime: 0,
  pumpsCollected: 0,
  
  // Player Position & Motion
  posX: 0,
  posY: 0.5,
  velX: 0,
  velY: 0,
  
  // Player Controls (A/D for steering, Space Bar for Hot Air Pump Buoyancy)
  keyLeft: false,  // A / ArrowLeft
  keyRight: false, // D / ArrowRight
  keyPump: false,  // Space Bar

  // 3D Objects & Environment
  balloonGroup: new THREE.Group(),
  envelopeMesh: null,
  cabinMesh: null,
  
  terrains: [],
  trees: [],
  houses: [],
  clouds: [],
  airPumps: [],
  spikes: [],
  particles: [],
  windParticles: null
};

/* ==========================================================================
   Three.js Engine & Environment Setup
   ========================================================================== */
const container = document.getElementById('canvas-container');
const popupsContainer = document.getElementById('popups-container');
const hitFlashOverlay = document.getElementById('hit-flash-overlay');
const airGaugeCard = document.getElementById('air-gauge-card');

const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 1.8, 7.5);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
container.appendChild(renderer.domElement);

// Fog for Atmospheric Depth
scene.fog = new THREE.FogExp2(0x38bdf8, 0.005);

// Dreamy High-Altitude Sky Gradient
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 16;
skyCanvas.height = 256;
const skyCtx = skyCanvas.getContext('2d');
const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 256);
skyGrad.addColorStop(0.0, '#0f172a');
skyGrad.addColorStop(0.25, '#1e1b4b');
skyGrad.addColorStop(0.55, '#5b21b6');
skyGrad.addColorStop(0.75, '#38bdf8');
skyGrad.addColorStop(1.0, '#bae6fd');
skyCtx.fillStyle = skyGrad;
skyCtx.fillRect(0, 0, 16, 256);

const skyTexture = new THREE.CanvasTexture(skyCanvas);
scene.background = skyTexture;

// Lighting Setup
const ambientLight = new THREE.AmbientLight(0xfff0f5, 1.4);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x15803d, 1.3);
hemiLight.position.set(0, 40, 0);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffedd5, 2.2);
sunLight.position.set(15, 30, 20);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 1024;
sunLight.shadow.mapSize.height = 1024;
sunLight.shadow.camera.left = -20;
sunLight.shadow.camera.right = 20;
sunLight.shadow.camera.top = 20;
sunLight.shadow.camera.bottom = -20;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 80;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0xf472b6, 1.0);
fillLight.position.set(-10, 8, -8);
scene.add(fillLight);

// Add Player Group
scene.add(state.balloonGroup);

/* ==========================================================================
   Visual Effects System (Pooled Particles for Zero-GC Operations)
   ========================================================================== */
const flameGeo = new THREE.SphereGeometry(0.09, 6, 6);
const flameMat1 = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
const burstGeo = new THREE.DodecahedronGeometry(0.12, 0);

const particlePool = [];

function getPooledParticle(geo, mat) {
  let p = particlePool.pop();
  if (!p) {
    p = new THREE.Mesh(geo, mat);
    p.userData = {
      vel: new THREE.Vector3(),
      rotVel: new THREE.Vector3(),
      life: 0,
      maxLife: 1
    };
  } else {
    p.geometry = geo;
    p.material = mat;
  }
  p.visible = true;
  return p;
}

function recycleParticle(p) {
  p.visible = false;
  scene.remove(p);
  particlePool.push(p);
}

function spawnParticleBurst(position, colorHex, count = 25) {
  const pMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending
  });

  for (let i = 0; i < count; i++) {
    const pMesh = getPooledParticle(burstGeo, pMat);
    pMesh.position.copy(position);

    const speed = 2.5 + Math.random() * 4.0;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;

    pMesh.userData.vel.set(
      Math.sin(phi) * Math.cos(theta) * speed,
      Math.cos(phi) * speed,
      Math.sin(phi) * Math.sin(theta) * speed
    );
    pMesh.userData.rotVel.set(
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8
    );
    pMesh.userData.life = 0.8 + Math.random() * 0.4;
    pMesh.userData.maxLife = 1.2;

    scene.add(pMesh);
    state.particles.push(pMesh);
  }
}

function spawnBurnerFlame() {
  for (let i = 0; i < 4; i++) {
    const mat = Math.random() > 0.4 ? flameMat1 : flameMat2;
    const flame = getPooledParticle(flameGeo, mat);
    flame.position.set(
      state.posX + (Math.random() - 0.5) * 0.15,
      state.posY - 0.3,
      (Math.random() - 0.5) * 0.15
    );

    flame.userData.vel.set(
      (Math.random() - 0.5) * 0.8,
      -1.8 - Math.random() * 1.5,
      (Math.random() - 0.5) * 0.8
    );
    flame.userData.rotVel.set(0, 0, 0);
    flame.userData.life = 0.3 + Math.random() * 0.2;
    flame.userData.maxLife = 0.5;

    scene.add(flame);
    state.particles.push(flame);
  }
}

function spawnPopupBadge(text, type, worldPos) {
  const popup = document.createElement('div');
  popup.className = `popup-text popup-${type}`;
  popup.textContent = text;

  const tempV = worldPos.clone();
  tempV.project(camera);

  const x = (tempV.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-(tempV.y * 0.5) + 0.5) * window.innerHeight;

  popup.style.left = `${x}px`;
  popup.style.top = `${y}px`;

  popupsContainer.appendChild(popup);

  setTimeout(() => {
    if (popup.parentNode) popup.parentNode.removeChild(popup);
  }, 900);
}

function triggerScreenHitFlash() {
  hitFlashOverlay.classList.add('flash-active');
  setTimeout(() => hitFlashOverlay.classList.remove('flash-active'), 180);
}

function triggerAirGaugePulse(type) {
  airGaugeCard.classList.add(`pulse-${type}`);
  setTimeout(() => airGaugeCard.classList.remove(`pulse-${type}`), 300);
}

/* ==========================================================================
   High-Altitude 3D Ground Terrain & Distant Countryside
   ========================================================================== */

function createTerrainSegment(offsetZ) {
  const geo = new THREE.PlaneGeometry(160, 120, 24, 24);
  geo.rotateX(-Math.PI / 2);
  
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const hillHeight = Math.sin(x * 0.08) * Math.cos(z * 0.06) * 3.5 + Math.sin(z * 0.12) * 2.0;
    pos.setY(i, hillHeight - 14.0);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x16a34a,
    roughness: 0.88,
    metalness: 0.05,
    flatShading: true
  });

  const terrain = new THREE.Mesh(geo, mat);
  terrain.position.z = offsetZ;
  terrain.receiveShadow = true;
  return terrain;
}

const terrain1 = createTerrainSegment(0);
const terrain2 = createTerrainSegment(-120);
scene.add(terrain1);
scene.add(terrain2);
state.terrains.push(terrain1, terrain2);

function createTreeMesh() {
  const treeGroup = new THREE.Group();
  
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.22, 1.0, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.5;
  treeGroup.add(trunk);

  const foliageGeo = new THREE.ConeGeometry(1.0, 2.2, 6);
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8, flatShading: true });
  const foliage = new THREE.Mesh(foliageGeo, foliageMat);
  foliage.position.y = 2.0;
  treeGroup.add(foliage);

  treeGroup.castShadow = true;
  return treeGroup;
}

function createHouseMesh() {
  const houseGroup = new THREE.Group();
  
  const wallGeo = new THREE.BoxGeometry(1.0, 0.8, 1.0);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.8 });
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.position.y = 0.4;
  houseGroup.add(walls);

  const roofGeo = new THREE.ConeGeometry(0.9, 0.7, 4);
  roofGeo.rotateY(Math.PI / 4);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7, flatShading: true });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 1.15;
  houseGroup.add(roof);

  houseGroup.castShadow = true;
  return houseGroup;
}

for (let i = 0; i < 50; i++) {
  const tree = createTreeMesh();
  resetGroundItemPos(tree, true);
  scene.add(tree);
  state.trees.push(tree);
}

for (let i = 0; i < 20; i++) {
  const house = createHouseMesh();
  resetGroundItemPos(house, true);
  scene.add(house);
  state.houses.push(house);
}

function resetGroundItemPos(item, initial = false) {
  const sideX = (Math.random() > 0.5 ? 1 : -1) * (4.0 + Math.random() * 25);
  item.position.set(
    sideX,
    -14.0,
    initial ? (Math.random() - 0.5) * 120 : -80 - Math.random() * 40
  );
  const scale = 0.7 + Math.random() * 0.5;
  item.scale.setScalar(scale);
}

/* ==========================================================================
   High-Altitude 3D Clouds & Wind Particles
   ========================================================================== */

function createCloud() {
  const cloudGroup = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xfff0f5,
    roughness: 0.9,
    metalness: 0.1,
    flatShading: true,
    transparent: true,
    opacity: 0.85
  });

  const numPuffs = 6 + Math.floor(Math.random() * 4);
  for (let i = 0; i < numPuffs; i++) {
    const radius = 1.0 + Math.random() * 1.5;
    const geo = new THREE.DodecahedronGeometry(radius, 1);
    const puff = new THREE.Mesh(geo, mat);
    puff.position.set(
      (Math.random() - 0.5) * 2.5,
      (Math.random() - 0.5) * 1.0,
      (Math.random() - 0.5) * 2.0
    );
    cloudGroup.add(puff);
  }
  return cloudGroup;
}

for (let i = 0; i < 30; i++) {
  const cloud = createCloud();
  resetCloudPos(cloud, true);
  scene.add(cloud);
  state.clouds.push(cloud);
}

function resetCloudPos(cloud, initial = false) {
  const sideX = (Math.random() > 0.5 ? 1 : -1) * (10.0 + Math.random() * 20.0);
  cloud.position.set(
    sideX,
    8.0 + Math.random() * 12,
    initial ? (Math.random() - 0.5) * 70 : -50 - Math.random() * 25
  );
  const scale = 1.0 + Math.random() * 1.6;
  cloud.scale.setScalar(scale);
}

const windCount = 150;
const windGeo = new THREE.BufferGeometry();
const windPos = new Float32Array(windCount * 3);

for (let i = 0; i < windCount * 3; i += 3) {
  windPos[i] = (Math.random() - 0.5) * 20;
  windPos[i + 1] = Math.random() * 10 - 2;
  windPos[i + 2] = (Math.random() - 0.5) * 40;
}

windGeo.setAttribute('position', new THREE.BufferAttribute(windPos, 3));
const windMat = new THREE.PointsMaterial({
  size: 0.08,
  color: 0xfbcfe8,
  transparent: true,
  opacity: 0.6,
  blending: THREE.AdditiveBlending
});

state.windParticles = new THREE.Points(windGeo, windMat);
scene.add(state.windParticles);

/* ==========================================================================
   Procedural 3D Collectibles (Air Pumps) & Hazards (Spikes)
   ========================================================================== */

function createAirPumpMesh() {
  const pumpGroup = new THREE.Group();
  
  const bodyGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.7, 12);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    metalness: 0.7,
    roughness: 0.2,
    emissive: 0x059669,
    emissiveIntensity: 0.8
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  pumpGroup.add(body);

  const capGeo = new THREE.CylinderGeometry(0.15, 0.27, 0.18, 12);
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9 });
  const cap = new THREE.Mesh(capGeo, capMat);
  cap.position.y = 0.4;
  pumpGroup.add(cap);

  pumpGroup.castShadow = true;
  return pumpGroup;
}

function createSpikeMesh() {
  const spikeGroup = new THREE.Group();
  
  const coreGeo = new THREE.SphereGeometry(0.35, 10, 10);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    metalness: 0.8,
    roughness: 0.2,
    emissive: 0xdc2626,
    emissiveIntensity: 0.9
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  spikeGroup.add(core);

  const coneGeo = new THREE.ConeGeometry(0.09, 0.45, 6);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.1 });

  const directions = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    [0.7, 0.7, 0], [-0.7, 0.7, 0], [0.7, -0.7, 0], [-0.7, -0.7, 0]
  ];

  directions.forEach(([x, y, z]) => {
    const spike = new THREE.Mesh(coneGeo, coneMat);
    spike.position.set(x * 0.35, y * 0.35, z * 0.35);
    spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z).normalize());
    spikeGroup.add(spike);
  });

  return spikeGroup;
}

for (let i = 0; i < 4; i++) {
  const pump = createAirPumpMesh();
  resetPumpPos(pump);
  scene.add(pump);
  state.airPumps.push(pump);
}

for (let i = 0; i < 5; i++) {
  const spike = createSpikeMesh();
  resetSpikePos(spike);
  scene.add(spike);
  state.spikes.push(spike);
}

function resetPumpPos(pump) {
  pump.position.set(
    (Math.random() - 0.5) * 10,
    Math.random() * 3.8 - 0.5,
    -15 - Math.random() * 20
  );
}

function resetSpikePos(spike) {
  spike.position.set(
    (Math.random() - 0.5) * 11,
    Math.random() * 4.0 - 0.5,
    -20 - Math.random() * 25
  );
}

/* ==========================================================================
   Load 3D FBX Balloon Model
   ========================================================================== */
const loader = new FBXLoader();
const loadingOverlay = document.getElementById('loading-overlay');

loader.load(
  './baloon.fbx',
  (fbx) => {
    fbx.traverse((child) => {
      if (child.isMesh && child.geometry) {
        child.castShadow = true;
        child.receiveShadow = true;

        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => m.flatShading = true);
        }

        if (child.name === 'Baloon') {
          state.envelopeMesh = child;
          const geo = child.geometry;
          const posAttr = geo.attributes.position;
          const orig = new Float32Array(posAttr.array);
          child.userData.originalPositions = orig;

          let minZ = Infinity, maxZ = -Infinity;
          for (let i = 0; i < posAttr.count; i++) {
            const z = orig[i * 3 + 2];
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
          }
          child.userData.minZ = minZ;
          child.userData.maxZ = maxZ;
          child.userData.heightZ = maxZ - minZ;
        } else if (child.name === 'Cabin') {
          state.cabinMesh = child;
        }
      }
    });

    const box = new THREE.Box3().setFromObject(fbx);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    state.baseScale = 2.6 / maxDim;
    fbx.position.sub(center);

    state.balloonGroup.add(fbx);
    state.balloonGroup.scale.setScalar(state.baseScale);

    setTimeout(() => {
      loadingOverlay.classList.remove('active');
    }, 300);
  },
  undefined,
  (err) => console.error('Error loading FBX balloon:', err)
);

/* ==========================================================================
   Input Handling: A/D or Left/Right Arrows to steer, Space to Pump Hot Air
   ========================================================================== */
window.addEventListener('keydown', (e) => {
  if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') state.keyLeft = true;
  if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') state.keyRight = true;

  // SPACE BAR is dedicated exclusively to PUMPING HOT AIR!
  if (e.key === ' ') {
    e.preventDefault();
    state.keyPump = true;
    pumpAir();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') state.keyLeft = false;
  if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') state.keyRight = false;
  if (e.key === ' ') state.keyPump = false;
});

// On-Screen Touch Buttons (Left, Right, Space Pump)
document.getElementById('btn-left').addEventListener('pointerdown', () => state.keyLeft = true);
document.getElementById('btn-left').addEventListener('pointerup', () => state.keyLeft = false);

document.getElementById('btn-right').addEventListener('pointerdown', () => state.keyRight = true);
document.getElementById('btn-right').addEventListener('pointerup', () => state.keyRight = false);

document.getElementById('btn-pump').addEventListener('pointerdown', () => {
  state.keyPump = true;
  pumpAir();
});
document.getElementById('btn-pump').addEventListener('pointerup', () => state.keyPump = false);

function pumpAir() {
  if (state.mode !== 'PLAYING') return;
  state.airPressure = Math.min(100, state.airPressure + 3.5);
  state.velY += 0.09; // Thermal buoyancy lift upward!
  spawnBurnerFlame();
}

/* ==========================================================================
   Game State Management
   ========================================================================== */
const menuScreen = document.getElementById('menu-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const gameHud = document.getElementById('game-hud');
const scoreText = document.getElementById('score-text');
const timeText = document.getElementById('time-text');
const pumpsText = document.getElementById('pumps-text');
const airPercent = document.getElementById('air-percent');
const airFill = document.getElementById('air-fill');

document.getElementById('btn-start-game').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', startGame);

function startGame() {
  state.mode = 'PLAYING';
  state.airPressure = 100;
  state.drainRate = 2.5;
  state.score = 0;
  state.survivalTime = 0;
  state.pumpsCollected = 0;
  state.posX = 0;
  state.posY = 0.5;
  state.velX = 0;
  state.velY = 0;

  if (state.balloonGroup) {
    state.balloonGroup.position.set(0, 0.5, 0);
    state.balloonGroup.rotation.set(0, 0, 0);
  }

  state.airPumps.forEach(resetPumpPos);
  state.spikes.forEach(resetSpikePos);
  state.trees.forEach(t => resetGroundItemPos(t, true));
  state.houses.forEach(h => resetGroundItemPos(h, true));

  menuScreen.classList.remove('active');
  menuScreen.classList.add('hidden');
  gameoverScreen.classList.remove('active');
  gameoverScreen.classList.add('hidden');
  gameHud.classList.remove('hidden');
}

function gameOver(reason) {
  state.mode = 'GAME_OVER';
  gameHud.classList.add('hidden');
  gameoverScreen.classList.remove('hidden');
  gameoverScreen.classList.add('active');

  document.getElementById('gameover-reason').textContent = reason;
  document.getElementById('res-score').textContent = Math.round(state.score);
  document.getElementById('res-time').textContent = `${Math.floor(state.survivalTime)}s`;
  document.getElementById('res-pumps').textContent = state.pumpsCollected;
}

/* ==========================================================================
   Main Game Loop & Hot Air Balloon Buoyancy Physics
   ========================================================================== */
const clock = new THREE.Clock();
let lastScore = -1;
let lastTimeStr = '';
let lastPumps = -1;
let lastDisplayP = -1;
let lastDeformPressure = -1;

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  const time = clock.getElapsedTime();

  const flySpeed = (8.0 + state.survivalTime * 0.2) * delta;

  // 1. Update Active 3D Particles (Recycle to pool)
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.userData.life -= delta;

    if (p.userData.life <= 0) {
      recycleParticle(p);
      state.particles.splice(i, 1);
    } else {
      p.position.addScaledVector(p.userData.vel, delta);
      p.rotation.x += p.userData.rotVel.x * delta;
      p.rotation.y += p.userData.rotVel.y * delta;

      const progress = p.userData.life / p.userData.maxLife;
      p.material.opacity = progress;
      p.scale.setScalar(progress);
    }
  }

  // 2. Scroll Ground & Environment
  state.terrains.forEach(t => {
    t.position.z += flySpeed * 1.5;
    if (t.position.z > 60) t.position.z -= 240;
  });

  state.trees.forEach(t => {
    t.position.z += flySpeed * 1.5;
    if (t.position.z > 20) resetGroundItemPos(t, false);
  });

  state.houses.forEach(h => {
    h.position.z += flySpeed * 1.5;
    if (h.position.z > 20) resetGroundItemPos(h, false);
  });

  state.clouds.forEach(cloud => {
    cloud.position.z += flySpeed * 1.2;
    if (cloud.position.z > 20) resetCloudPos(cloud, false);
  });

  if (state.windParticles) {
    const positions = state.windParticles.geometry.attributes.position.array;
    for (let i = 2; i < windCount * 3; i += 3) {
      positions[i] += flySpeed * 2.5;
      if (positions[i] > 10) positions[i] = -30;
    }
    state.windParticles.geometry.attributes.position.needsUpdate = true;
  }

  if (state.mode === 'PLAYING') {
    // 3. Update Survival Stats
    state.survivalTime += delta;
    state.score += delta * 18;
    state.drainRate += delta * 0.05;
    state.airPressure -= state.drainRate * delta;

    if (state.airPressure <= 0) {
      state.airPressure = 0;
      gameOver('Your air pressure ran out completely!');
    }

    if (state.keyPump) {
      spawnBurnerFlame();
    }

    // Cached HUD Updates (Avoid layout thrashing)
    const roundedScore = Math.round(state.score);
    if (roundedScore !== lastScore) {
      scoreText.textContent = roundedScore;
      lastScore = roundedScore;
    }

    const mins = Math.floor(state.survivalTime / 60).toString().padStart(2, '0');
    const secs = Math.floor(state.survivalTime % 60).toString().padStart(2, '0');
    const timeStr = `${mins}:${secs}`;
    if (timeStr !== lastTimeStr) {
      timeText.textContent = timeStr;
      lastTimeStr = timeStr;
    }

    if (state.pumpsCollected !== lastPumps) {
      const pumpsCountElem = document.getElementById('pumps-count-text') || pumpsText;
      if (pumpsCountElem) pumpsCountElem.textContent = `${state.pumpsCollected} ⛽`;
      const btnPumpCountElem = document.getElementById('btn-pump-count');
      if (btnPumpCountElem) btnPumpCountElem.textContent = state.pumpsCollected;
      lastPumps = state.pumpsCollected;
    }

    const displayP = Math.round(state.airPressure);
    if (displayP !== lastDisplayP) {
      airPercent.textContent = `${displayP}%`;
      airFill.style.width = `${displayP}%`;
      lastDisplayP = displayP;
    }

    // 4. Hot Air Balloon Movement & Thermal Buoyancy Physics
    if (state.keyLeft) state.velX -= 0.45 * delta;  // A / Left Arrow
    if (state.keyRight) state.velX += 0.45 * delta; // D / Right Arrow

    // Natural Drag & Gravity Pull Downward (Pumping Space restores buoyancy!)
    state.velX *= 0.90;
    state.velY -= 0.16 * delta; // Gravity constantly pulls balloon downward

    state.posX += state.velX;
    state.posY += state.velY;

    state.posX = Math.max(-4.5, Math.min(4.5, state.posX));
    state.posY = Math.max(-1.4, Math.min(3.5, state.posY));

    if (state.balloonGroup) {
      state.balloonGroup.position.x = state.posX;
      state.balloonGroup.position.y = state.posY;
      state.balloonGroup.rotation.x = Math.max(-0.12, Math.min(0.12, state.velY * 0.4)); // Subtle pitch up/down
      state.balloonGroup.rotation.y = 0; // Lock forward facing direction towards camera
      state.balloonGroup.rotation.z = Math.max(-0.25, Math.min(0.25, -state.velX * 0.35)); // Gentle banking tilt
    }

    // Camera Follow
    camera.position.x += (state.posX * 0.4 - camera.position.x) * 0.05;
    camera.position.y += (state.posY * 0.3 + 1.8 - camera.position.y) * 0.05;
    camera.lookAt(state.posX * 0.2, state.posY * 0.2 + 0.5, 0);

    // 5. Move Collectibles & Hazards (Optimized Squared Distance)
    state.airPumps.forEach(pump => {
      pump.position.z += flySpeed;
      pump.rotation.y += 0.04;
      pump.position.y += Math.sin(time * 3 + pump.position.x) * 0.005;

      const distSq = pump.position.distanceToSquared(state.balloonGroup.position);
      if (distSq < 1.44) { // 1.2 * 1.2
        state.airPressure = Math.min(100, state.airPressure + 25);
        state.score += 150;
        state.pumpsCollected++;

        spawnParticleBurst(pump.position, 0x34d399, 30);
        spawnPopupBadge('+25% AIR! ⛽', 'gain', pump.position);
        triggerAirGaugePulse('gain');

        resetPumpPos(pump);
      } else if (pump.position.z > 6) {
        resetPumpPos(pump);
      }
    });

    state.spikes.forEach(spike => {
      spike.position.z += flySpeed;
      spike.rotation.x += 0.03;
      spike.rotation.y += 0.04;

      const distSq = spike.position.distanceToSquared(state.balloonGroup.position);
      if (distSq < 1.21) { // 1.1 * 1.1
        state.airPressure -= 30;

        spawnParticleBurst(spike.position, 0xef4444, 35);
        spawnPopupBadge('-30% AIR! ⚠️', 'loss', spike.position);
        triggerScreenHitFlash();
        triggerAirGaugePulse('loss');

        camera.position.x += (Math.random() - 0.5) * 0.9;
        camera.position.y += (Math.random() - 0.5) * 0.9;

        resetSpikePos(spike);

        if (state.airPressure <= 0) {
          gameOver('Spike popped your balloon!');
        }
      } else if (spike.position.z > 6) {
        resetSpikePos(spike);
      }
    });
  } else {
    // Menu Flight Motion
    if (state.balloonGroup) {
      state.balloonGroup.position.y = Math.sin(time * 1.5) * 0.15 + 0.5;
      state.balloonGroup.rotation.y += 0.005;
    }
  }

  // 6. Deform 3D Balloon Mesh based on current air pressure (Only when pressure changes)
  const p = Math.max(0, Math.min(1, state.airPressure / 100));
  const d = 1.0 - p;

  if (state.envelopeMesh && state.envelopeMesh.userData.originalPositions && Math.abs(state.airPressure - lastDeformPressure) > 0.001) {
    lastDeformPressure = state.airPressure;
    const geo = state.envelopeMesh.geometry;
    const posAttr = geo.attributes.position;
    const orig = state.envelopeMesh.userData.originalPositions;
    const minZ = state.envelopeMesh.userData.minZ;
    const heightZ = state.envelopeMesh.userData.heightZ || 1.0;

    for (let i = 0; i < posAttr.count; i++) {
      const ox = orig[i * 3];
      const oy = orig[i * 3 + 1];
      const oz = orig[i * 3 + 2];

      const h = Math.max(0, Math.min(1, (oz - minZ) / heightZ));
      const ropeHeight = 0.12;
      const anchorWeight = h < ropeHeight ? Math.pow(h / ropeHeight, 2.0) : 1.0;

      const crownFactor = Math.max(0, (h - 0.6) / 0.4);
      const crownIndent = d * 0.4 * Math.pow(crownFactor, 2.0) * heightZ * anchorWeight;
      const distFromAxis = Math.sqrt(ox * ox + oy * oy);
      const centerDimple = d * 0.3 * Math.pow(crownFactor, 3.0) * Math.exp(-distFromAxis * 0.8) * heightZ;

      const widthFactor = (1.0 - d * 0.35 * Math.sin(h * Math.PI)) * (1.0 - d * 0.3 * Math.pow(h, 1.5)) * anchorWeight;
      const angle = Math.atan2(oy, ox);
      const goreWrinkle = Math.sin(angle * 12) * d * 0.12 * Math.sin(h * Math.PI) * (distFromAxis + 0.1) * anchorWeight;

      let nx = (ox + Math.cos(angle) * goreWrinkle) * widthFactor;
      let ny = (oy + Math.sin(angle) * goreWrinkle) * widthFactor;
      let nz = oz - crownIndent - centerDimple;

      posAttr.setXYZ(i, nx, ny, nz);
    }

    posAttr.needsUpdate = true;
  }

  renderer.render(scene, camera);
}
animate();

// Window Resize Handling
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
