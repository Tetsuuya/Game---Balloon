import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

/* ==========================================================================
   State & App Setup
   ========================================================================== */
const state = {
  balloonGroup: new THREE.Group(),
  envelopeMesh: null, // Baloon fabric + ropes mesh
  cabinMesh: null,    // Cabin basket mesh
  materials: [],

  // Air Pressure Physics
  targetPressure: 100, // 100% (full) to 0% (deflated)
  currentPressure: 100,
  isAutoCycle: false,
  autoCycleDirection: -1,

  baseScale: 1.0
};

// Container & Scene
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0c14, 0.018);

// Camera
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 1.2, 5.5);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
container.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 + 0.05;

// Vibrant Multi-Angle Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 1.6);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x475569, 1.2);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

const frontLight = new THREE.DirectionalLight(0xffffff, 1.5);
frontLight.position.set(0, 4, 10);
scene.add(frontLight);

const dirLight = new THREE.DirectionalLight(0xfff5ea, 1.8);
dirLight.position.set(6, 12, 8);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.camera.left = -10;
dirLight.shadow.camera.right = 10;
dirLight.shadow.camera.top = 10;
dirLight.shadow.camera.bottom = -10;
scene.add(dirLight);

const fillLightLeft = new THREE.DirectionalLight(0xe0f2fe, 1.2);
fillLightLeft.position.set(-6, 6, 6);
scene.add(fillLightLeft);

// Ground Shadow Receiver
const shadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.ShadowMaterial({ opacity: 0.3 })
);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.position.y = -1.5;
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

// Add Balloon Group to Scene
scene.add(state.balloonGroup);

/* ==========================================================================
   Air Leak Exhaust Particles
   ========================================================================== */
const leakParticleCount = 80;
const leakGeo = new THREE.BufferGeometry();
const leakPos = new Float32Array(leakParticleCount * 3);
const leakVel = [];

for (let i = 0; i < leakParticleCount; i++) {
  leakPos[i * 3] = 0;
  leakPos[i * 3 + 1] = -0.5;
  leakPos[i * 3 + 2] = 0;
  leakVel.push(new THREE.Vector3(
    (Math.random() - 0.5) * 0.04,
    -Math.random() * 0.12 - 0.04,
    (Math.random() - 0.5) * 0.04
  ));
}

leakGeo.setAttribute('position', new THREE.BufferAttribute(leakPos, 3));
const leakMat = new THREE.PointsMaterial({
  size: 0.06,
  color: 0xe0f2fe,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending
});
const leakParticles = new THREE.Points(leakGeo, leakMat);
state.balloonGroup.add(leakParticles);

/* ==========================================================================
   Load FBX & Setup True Z-Axis Bounds
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
          mats.forEach(m => {
            m.flatShading = true;
            state.materials.push(m);
          });
        }

        if (child.name === 'Baloon') {
          state.envelopeMesh = child;
          const geo = child.geometry;
          const posAttr = geo.attributes.position;
          const orig = new Float32Array(posAttr.array);
          child.userData.originalPositions = orig;

          // Compute Z range for true height axis in raw FBX array (Z=0.58 at ropes, Z=9.30 at top crown)
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

    // Auto-center & Scale overall balloon model
    const box = new THREE.Box3().setFromObject(fbx);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    state.baseScale = 3.2 / maxDim;
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
   UI Controls
   ========================================================================== */
const pressureText = document.getElementById('pressure-text');
const pressureBar = document.getElementById('pressure-bar');
const sliderPressure = document.getElementById('slider-pressure');
const btnDeflate = document.getElementById('btn-deflate');
const btnInflate = document.getElementById('btn-inflate');
const btnAutoCycle = document.getElementById('btn-auto-cycle');

function setTargetPressure(val) {
  state.targetPressure = Math.max(0, Math.min(100, val));
  sliderPressure.value = state.targetPressure;
}

btnDeflate.addEventListener('click', () => {
  state.isAutoCycle = false;
  btnAutoCycle.classList.remove('active');
  setTargetPressure(0);
});

btnInflate.addEventListener('click', () => {
  state.isAutoCycle = false;
  btnAutoCycle.classList.remove('active');
  setTargetPressure(100);
});

sliderPressure.addEventListener('input', (e) => {
  state.isAutoCycle = false;
  btnAutoCycle.classList.remove('active');
  setTargetPressure(parseFloat(e.target.value));
});

btnAutoCycle.addEventListener('click', () => {
  state.isAutoCycle = !state.isAutoCycle;
  btnAutoCycle.classList.toggle('active', state.isAutoCycle);
});

/* ==========================================================================
   14-Frame Accurate Hot Air Balloon Deflation Engine (Matching Reference)
   ========================================================================== */
const clock = new THREE.Clock();
let lastDisplayPercent = -1;
let lastDeformPressure = -1;

function animate() {
  requestAnimationFrame(animate);
  const time = clock.getElapsedTime();

  // Auto-Cycle Mode
  if (state.isAutoCycle) {
    state.targetPressure += state.autoCycleDirection * 0.4;
    if (state.targetPressure <= 2) {
      state.targetPressure = 2;
      state.autoCycleDirection = 1;
    } else if (state.targetPressure >= 100) {
      state.targetPressure = 100;
      state.autoCycleDirection = -1;
    }
    sliderPressure.value = state.targetPressure;
  }

  // Smooth Pressure Interpolation
  state.currentPressure += (state.targetPressure - state.currentPressure) * 0.06;
  const p = Math.max(0, Math.min(1, state.currentPressure / 100)); // 1.0 (Full) -> 0.0 (Deflated)
  const d = 1.0 - p; // Deflation Progress: 0.0 (Full) -> 1.0 (Deflated)

  // Update UI Gauge (Cached)
  const displayPercent = Math.round(state.currentPressure);
  if (displayPercent !== lastDisplayPercent) {
    pressureText.textContent = `${displayPercent}%`;
    pressureBar.style.width = `${displayPercent}%`;
    lastDisplayPercent = displayPercent;
  }

  // --------------------------------------------------------------------------
  // 1. Buoyancy & Rigid Basket Landing Physics
  // --------------------------------------------------------------------------
  if (state.balloonGroup) {
    // Airborne (p > 0.4): Balloon floats at +0.3 with gentle bobbing (Frames 1-5)
    // Landed (p <= 0.4): Basket touches down on ground shadow plane at -0.65 (Frames 6-14)
    const floatRatio = Math.max(0, (p - 0.4) / 0.6);
    const buoyancyY = -0.65 + 0.95 * Math.pow(floatRatio, 0.7);
    const floatBobbing = Math.sin(time * 1.8) * 0.08 * floatRatio;

    state.balloonGroup.position.y = buoyancyY + floatBobbing;

    // Air Leak Shaking
    const isDeflatingFast = (state.currentPressure - state.targetPressure) > 2;
    if (isDeflatingFast && p > 0.05) {
      const wobble = d * 0.08;
      state.balloonGroup.rotation.z = Math.sin(time * 30) * wobble;
      state.balloonGroup.rotation.x = Math.cos(time * 25) * wobble;
      leakMat.opacity = Math.min(1, (state.currentPressure - state.targetPressure) / 15);
    } else {
      state.balloonGroup.rotation.z = Math.sin(time * 0.8) * 0.02 * floatRatio;
      state.balloonGroup.rotation.x = Math.cos(time * 0.6) * 0.015 * floatRatio;
      state.balloonGroup.rotation.y += 0.003 * floatRatio;
      leakMat.opacity *= 0.85;
    }
  }

  // --------------------------------------------------------------------------
  // 2. 14-Keyframe Accurate Fabric Deflation (Matching Reference Image)
  // --------------------------------------------------------------------------
  if (state.envelopeMesh && state.envelopeMesh.userData.originalPositions && Math.abs(state.currentPressure - lastDeformPressure) > 0.001) {
    lastDeformPressure = state.currentPressure;
    const geo = state.envelopeMesh.geometry;
    const posAttr = geo.attributes.position;
    const orig = state.envelopeMesh.userData.originalPositions;
    const minZ = state.envelopeMesh.userData.minZ;
    const heightZ = state.envelopeMesh.userData.heightZ || 1.0;

    for (let i = 0; i < posAttr.count; i++) {
      const ox = orig[i * 3];
      const oy = orig[i * 3 + 1];
      const oz = orig[i * 3 + 2];

      // True Height ratio h along Z axis (0.0 at rope bottom attachment, 1.0 at top crown)
      const h = Math.max(0, Math.min(1, (oz - minZ) / heightZ));

      // Rope Anchor Constraint:
      // h < 0.12 is the 4 ropes attached to basket corners (stay 100% hooked at h=0)
      const ropeHeight = 0.12;
      const anchorWeight = h < ropeHeight ? Math.pow(h / ropeHeight, 2.0) : 1.0;

      // Phase 1 (Ref Frames 1-5): Airborne Top Crown Indentation
      const crownFactor = Math.max(0, (h - 0.6) / 0.4);
      const crownIndent = d * 0.4 * Math.pow(crownFactor, 2.0) * heightZ * anchorWeight;
      const distFromAxis = Math.sqrt(ox * ox + oy * oy);
      const centerDimple = d * 0.3 * Math.pow(crownFactor, 3.0) * Math.exp(-distFromAxis * 0.8) * heightZ;

      // Phase 2 (Ref Frames 4-8): Vertical Gore Pleats (12 fabric folds)
      const angle = Math.atan2(oy, ox);
      const goreWrinkle = Math.sin(angle * 12) * d * 0.14 * Math.sin(h * Math.PI) * (distFromAxis + 0.1) * anchorWeight;

      // Phase 3 (Ref Frames 9-12): Sideways Crumple & Envelope Collapse
      const leanProgress = Math.max(0, (d - 0.4) / 0.45); // 0 to 1 as d goes 0.4 -> 0.85
      const leanAngle = 0.5; // Direction of sideways lean
      const leanDist = Math.sin(leanProgress * Math.PI * 0.5) * Math.pow(h, 1.3) * heightZ * 0.35 * anchorWeight;
      const leanSag = Math.sin(leanProgress * Math.PI * 0.5) * Math.pow(h, 1.5) * heightZ * 0.3 * anchorWeight;

      // Phase 4 (Ref Frames 13-14): Full Ground Flattening into Fabric Heap
      const groundProgress = Math.max(0, (d - 0.7) / 0.3); // 0 to 1 as d goes 0.7 -> 1.0
      const groundSag = groundProgress * h * heightZ * 0.55 * anchorWeight;

      // Inward Width Contraction (contracts inward as air drops)
      const widthFactor = (1.0 - d * 0.35 * Math.sin(h * Math.PI)) * (1.0 - d * 0.3 * Math.pow(h, 1.5)) * anchorWeight;
      const ropeFlex = (1 - anchorWeight) * d * 0.06 * Math.sin((h / ropeHeight) * Math.PI);

      let nx = (ox + Math.cos(angle) * (goreWrinkle + ropeFlex)) * widthFactor + Math.cos(leanAngle) * leanDist;
      let ny = (oy + Math.sin(angle) * (goreWrinkle + ropeFlex)) * widthFactor + Math.sin(leanAngle) * leanDist;
      let nz = oz - crownIndent - centerDimple - leanSag - groundSag;

      // Ground Plane Collision Clamping (Terrain level)
      if (nz < minZ + 0.1) {
        const penetration = (minZ + 0.1) - nz;
        nz = minZ + 0.1 + Math.random() * 0.03; // Flatten on floor
        
        // Fabric spreads horizontally on ground beside basket
        const spread = penetration * 0.75;
        nx += Math.cos(angle + 0.3) * spread;
        ny += Math.sin(angle + 0.3) * spread;
      }

      posAttr.setXYZ(i, nx, ny, nz);
    }

    posAttr.needsUpdate = true;
  }

  // Particle exhaust update
  if (leakMat.opacity > 0.01) {
    const positions = leakGeo.attributes.position.array;
    for (let i = 0; i < leakParticleCount; i++) {
      positions[i * 3 + 1] += leakVel[i].y;
      positions[i * 3] += leakVel[i].x;
      positions[i * 3 + 2] += leakVel[i].z;

      if (positions[i * 3 + 1] < -1.5) {
        positions[i * 3] = (Math.random() - 0.5) * 0.06;
        positions[i * 3 + 1] = -0.3;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 0.06;
      }
    }
    leakGeo.attributes.position.needsUpdate = true;
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

// Handle Window Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
