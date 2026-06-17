import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js";

const scoreEl = document.querySelector("#score");
const timerEl = document.querySelector("#timer");
const stateEl = document.querySelector("#state");
const overlay = document.querySelector("#overlay");
const desktopButton = document.querySelector("#playDesktop");
const vrButton = document.querySelector("#enterVr");
const xrMessage = document.querySelector("#xrMessage");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070b);
scene.fog = new THREE.FogExp2(0x05070b, 0.025);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 160);
camera.position.set(0, 1.65, 6.2);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const arena = new THREE.Group();
scene.add(arena);

let score = 0;
let timeLeft = 60;
let running = false;
let gameStartedAt = 0;
let controller;

const targetMeshes = [];
const sparks = [];
const aimLine = createAimLine();

scene.add(new THREE.HemisphereLight(0x8fb6ff, 0x111318, 1.4));

const keyLight = new THREE.DirectionalLight(0x7dff6a, 2.4);
keyLight.position.set(-4, 8, 4);
scene.add(keyLight);

const rimLight = new THREE.PointLight(0xff3d8d, 45, 30);
rimLight.position.set(4, 3, -4);
scene.add(rimLight);

createArena();
createTargets();
createReticle();

desktopButton.addEventListener("click", () => startGame("Desktop"));
renderer.domElement.addEventListener("pointerdown", fireDesktop);
renderer.domElement.addEventListener("pointermove", (event) => {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

vrButton.addEventListener("click", enterVr);
window.addEventListener("resize", resize);

if ("xr" in navigator) {
  navigator.xr.isSessionSupported("immersive-vr").then((supported) => {
    vrButton.disabled = !supported;
    xrMessage.textContent = supported ? "VR is ready. Use a trigger to shatter targets." : "This browser or device does not report immersive VR support.";
  });
} else {
  vrButton.disabled = true;
  xrMessage.textContent = "WebXR is not available in this browser.";
}

renderer.setAnimationLoop(render);

function createArena() {
  const grid = new THREE.GridHelper(42, 42, 0x2bf2ff, 0x243247);
  grid.position.y = 0;
  arena.add(grid);

  const ringGeometry = new THREE.TorusGeometry(8, 0.025, 8, 160);
  const colors = [0x2bf2ff, 0x7dff6a, 0xff3d8d];
  for (let i = 0; i < 8; i += 1) {
    const ring = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshStandardMaterial({
        color: colors[i % colors.length],
        emissive: colors[i % colors.length],
        emissiveIntensity: 0.65,
        roughness: 0.45,
        metalness: 0.25
      })
    );
    ring.position.y = 1.4 + i * 0.55;
    ring.rotation.x = Math.PI / 2;
    ring.scale.setScalar(0.42 + i * 0.12);
    arena.add(ring);
  }

  const starGeometry = new THREE.BufferGeometry();
  const starPositions = [];
  for (let i = 0; i < 900; i += 1) {
    const radius = 28 + Math.random() * 70;
    const angle = Math.random() * Math.PI * 2;
    starPositions.push(
      Math.cos(angle) * radius,
      Math.random() * 34 - 4,
      Math.sin(angle) * radius
    );
  }
  starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({ color: 0xe8f7ff, size: 0.055, transparent: true, opacity: 0.9 })
  );
  scene.add(stars);
}

function createTargets() {
  const geometry = new THREE.IcosahedronGeometry(0.42, 1);
  const palette = [0x2bf2ff, 0xff3d8d, 0x7dff6a, 0xffd166];

  for (let i = 0; i < 16; i += 1) {
    const material = new THREE.MeshStandardMaterial({
      color: palette[i % palette.length],
      emissive: palette[i % palette.length],
      emissiveIntensity: 0.55,
      roughness: 0.28,
      metalness: 0.36
    });
    const target = new THREE.Mesh(geometry, material);
    target.userData = {
      phase: Math.random() * Math.PI * 2,
      radius: 3.2 + Math.random() * 5.4,
      height: 1.25 + Math.random() * 4.4,
      speed: 0.24 + Math.random() * 0.58,
      value: 10
    };
    targetMeshes.push(target);
    arena.add(target);
  }
}

function createReticle() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.018, 0.028, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72 })
  );
  ring.position.set(0, 0, -1.6);
  ring.name = "reticle";
  camera.add(ring);
  scene.add(camera);
}

function createAimLine() {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -7)]),
    new THREE.LineBasicMaterial({ color: 0x7dff6a, transparent: true, opacity: 0.78 })
  );
  line.name = "aimLine";
  return line;
}

async function enterVr() {
  if (!navigator.xr) return;

  const session = await navigator.xr.requestSession("immersive-vr", {
    optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"]
  });
  await renderer.xr.setSession(session);
  overlay.classList.add("is-hidden");
  stateEl.textContent = "VR";
  startGame("VR");

  controller = renderer.xr.getController(0);
  controller.add(aimLine);
  controller.addEventListener("selectstart", fireVr);
  scene.add(controller);

  session.addEventListener("end", () => {
    stateEl.textContent = "Desktop";
    overlay.classList.remove("is-hidden");
  });
}

function startGame(mode) {
  score = 0;
  timeLeft = 60;
  running = true;
  gameStartedAt = clock.getElapsedTime();
  scoreEl.textContent = "0";
  timerEl.textContent = "60";
  stateEl.textContent = mode;
  overlay.classList.add("is-hidden");
}

function fireDesktop() {
  if (!running) startGame("Desktop");
  raycaster.setFromCamera(pointer, camera);
  hitScan();
}

function fireVr() {
  if (!running) startGame("VR");
  const matrix = new THREE.Matrix4();
  matrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(matrix);
  hitScan();
}

function hitScan() {
  const hits = raycaster.intersectObjects(targetMeshes, false);
  if (!hits.length) return;

  const target = hits[0].object;
  score += target.userData.value;
  scoreEl.textContent = String(score);
  burst(target.position, target.material.color);
  resetTarget(target, true);
}

function burst(position, color) {
  const material = new THREE.PointsMaterial({
    color,
    size: 0.07,
    transparent: true,
    opacity: 1,
    depthWrite: false
  });
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const velocities = [];
  for (let i = 0; i < 44; i += 1) {
    positions.push(position.x, position.y, position.z);
    velocities.push(
      (Math.random() - 0.5) * 0.14,
      (Math.random() - 0.5) * 0.14,
      (Math.random() - 0.5) * 0.14
    );
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const particles = new THREE.Points(geometry, material);
  particles.userData = { life: 1, velocities };
  sparks.push(particles);
  scene.add(particles);
}

function resetTarget(target, jumpAhead = false) {
  target.userData.phase = Math.random() * Math.PI * 2 + (jumpAhead ? 3 : 0);
  target.userData.radius = 3.2 + Math.random() * 5.4;
  target.userData.height = 1.25 + Math.random() * 4.4;
  target.userData.speed = 0.24 + Math.random() * 0.7;
}

function updateTargets(elapsed) {
  targetMeshes.forEach((target, index) => {
    const data = target.userData;
    const angle = elapsed * data.speed + data.phase;
    target.position.set(
      Math.cos(angle) * data.radius,
      data.height + Math.sin(elapsed * 1.4 + index) * 0.45,
      Math.sin(angle) * data.radius - 1.6
    );
    target.rotation.x += 0.015 + index * 0.0004;
    target.rotation.y += 0.023;
    const pulse = 1 + Math.sin(elapsed * 4 + index) * 0.08;
    target.scale.setScalar(pulse);
  });
}

function updateSparks() {
  for (let i = sparks.length - 1; i >= 0; i -= 1) {
    const particles = sparks[i];
    const positions = particles.geometry.attributes.position.array;
    const velocities = particles.userData.velocities;
    particles.userData.life -= 0.025;
    particles.material.opacity = Math.max(0, particles.userData.life);

    for (let j = 0; j < positions.length; j += 3) {
      positions[j] += velocities[j];
      positions[j + 1] += velocities[j + 1];
      positions[j + 2] += velocities[j + 2];
    }
    particles.geometry.attributes.position.needsUpdate = true;

    if (particles.userData.life <= 0) {
      scene.remove(particles);
      particles.geometry.dispose();
      particles.material.dispose();
      sparks.splice(i, 1);
    }
  }
}

function updateTimer(elapsed) {
  if (!running) return;
  const remaining = Math.max(0, 60 - Math.floor(elapsed - gameStartedAt));
  if (remaining !== timeLeft) {
    timeLeft = remaining;
    timerEl.textContent = String(timeLeft);
  }

  if (timeLeft === 0) {
    running = false;
    stateEl.textContent = "Done";
    overlay.classList.remove("is-hidden");
  }
}

function render() {
  const elapsed = clock.getElapsedTime();
  arena.rotation.y = Math.sin(elapsed * 0.12) * 0.08;
  updateTargets(elapsed);
  updateSparks();
  updateTimer(elapsed);
  renderer.render(scene, camera);
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
