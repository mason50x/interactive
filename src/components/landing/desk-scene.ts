import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { handwritingForPage, sampleDeskMotion } from "./desk-motion";

/** One small, self-contained scene; no React updates in the animation loop. */
export function createDeskScene(host: HTMLDivElement, onReady: () => void) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-3.7, 3.7, 3.7, -3.7, 0.1, 50);
  camera.position.set(6, 8.3, 10);
  camera.lookAt(0, 0.45, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xfff5e7, 3.2);
  key.position.set(-3, 8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  key.shadow.normalBias = 0.035;
  key.shadow.bias = -0.0002;
  key.shadow.radius = 5;
  key.shadow.intensity = 0.42;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb6d6ff, 1.2);
  fill.position.set(4, 3, -5);
  scene.add(fill);

  const material = (color: number, roughness = 0.65, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const deskMaterial = material(0x527aab, 0.68);
  const paperMaterial = material(0xfff5df, 0.88);
  const yellow = material(0xffbb26, 0.35);
  const wood = material(0xdcb68a, 0.85);
  const lead = material(0x252c37, 0.6);
  const silver = material(0xc6ccd5, 0.27, 0.7);
  const pink = material(0xf38d9a, 0.85);
  const addMesh = (
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    parent: THREE.Object3D = scene,
  ) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const desk = addMesh(
    new RoundedBoxGeometry(4.7, 0.6, 3.8, 5, 0.16),
    deskMaterial,
  );
  desk.position.y = -0.3;

  // A soft contact shadow grounds the slab without introducing a horizon.
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext("2d")!;
  const gradient = shadowContext.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, "rgba(20, 29, 43, .48)");
  gradient.addColorStop(0.5, "rgba(20, 29, 43, .22)");
  gradient.addColorStop(1, "rgba(20, 29, 43, 0)");
  shadowContext.fillStyle = gradient;
  shadowContext.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(7.4, 6.2),
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.15, -0.67, 0.12);
  scene.add(shadow);

  const paperWidth = 1.95;
  const paperDepth = 2.48;
  const paperHeight = 0.12;
  const stack = new THREE.Group();
  stack.position.set(-0.25, 0, 0.04);
  stack.rotation.y = -0.08;
  scene.add(stack);
  for (let i = 0; i < 7; i++) {
    const leaf = addMesh(
      new THREE.BoxGeometry(paperWidth, 0.012, paperDepth),
      paperMaterial,
      stack,
    );
    leaf.position.y = 0.018 + i * 0.014;
    leaf.position.x = Math.sin(i * 2) * 0.025;
    leaf.rotation.y = Math.sin(i) * 0.018;
  }

  const sheetCanvas = document.createElement("canvas");
  sheetCanvas.width = 640;
  sheetCanvas.height = 800;
  const ctx = sheetCanvas.getContext("2d")!;
  const sheetTexture = new THREE.CanvasTexture(sheetCanvas);
  sheetTexture.colorSpace = THREE.SRGBColorSpace;
  sheetTexture.anisotropy = Math.min(
    renderer.capabilities.getMaxAnisotropy(),
    8,
  );
  const sheetMaterial = new THREE.MeshStandardMaterial({
    map: sheetTexture,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const sheetGeometry = new THREE.PlaneGeometry(paperWidth, paperDepth, 16, 32);
  sheetGeometry.rotateX(-Math.PI / 2);
  const sheet = addMesh(sheetGeometry, sheetMaterial, stack);
  sheet.position.y = paperHeight;
  const sheetPositions = sheetGeometry.attributes.position;
  const originalPositions = new Float32Array(sheetPositions.array);

  const lessons = [
    { title: "Ideas in motion", subtitle: "Explore, sketch, understand", formula: "energy = ½ mv²", prompt: "What changes at the top?", ink: "#2c4b84", accent: "#e9dba9" },
    { title: "Patterns in nature", subtitle: "Notice, compare, connect", formula: "1, 1, 2, 3, 5, 8, 13…", prompt: "Where does the pattern repeat?", ink: "#376b58", accent: "#d4e5bd" },
    { title: "Making waves", subtitle: "Listen, measure, discover", formula: "speed = frequency × wavelength", prompt: "What makes a note higher?", ink: "#66518d", accent: "#e4d7ef" },
    { title: "A different angle", subtitle: "Draw, reason, solve", formula: "a² + b² = c²", prompt: "Can you find the missing side?", ink: "#995735", accent: "#f0d4b6" },
  ];

  function paintSheet(progress: number, page: number) {
    const lesson = lessons[page];
    ctx.fillStyle = "#fff8e9";
    ctx.fillRect(0, 0, 640, 800);
    ctx.strokeStyle = "#cbd9e3";
    ctx.lineWidth = 1.4;
    for (let y = 170; y < 780; y += 68) {
      ctx.beginPath();
      ctx.moveTo(22, y);
      ctx.lineTo(618, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#e7aaa0";
    ctx.beginPath();
    ctx.moveTo(107, 20);
    ctx.lineTo(107, 780);
    ctx.stroke();
    const handwriting = handwritingForPage(page);
    const count = Math.floor(progress * (handwriting.length - 1));
    ctx.strokeStyle = lesson.ink;
    ctx.lineWidth = 3.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i <= count; i++) {
      const source = handwriting[i];
      const p = source;
      if (source.start) {
        ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = p.y < 165 ? lesson.ink : p.y < 240 ? "#b78027" : p.y > 650 ? "#577665" : lesson.ink;
        ctx.lineWidth = p.y < 165 ? 5 : p.y < 240 ? 3 : 3.4;
        ctx.moveTo(p.x, p.y);
      }
      else ctx.lineTo(p.x, p.y);
    }
    // Include the fractional segment so the stroke ends exactly at the tip.
    const fractional = progress * (handwriting.length - 1) - count;
    const next = handwriting[count + 1];
    if (next && !next.start) {
      const current = handwriting[count];
      ctx.lineTo(current.x + (next.x - current.x) * fractional, current.y + (next.y - current.y) * fractional);
    }
    ctx.stroke();
    sheetTexture.needsUpdate = true;
  }

  const pencil = new THREE.Group();
  scene.add(pencil);
  pencil.scale.set(1.3, 1, 1.3);
  const part = (
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    y: number,
  ) => {
    const mesh = addMesh(geometry, mat, pencil);
    mesh.position.y = y;
    return mesh;
  };
  // All parts are measured from the graphite tip, so the tip follows the ink.
  const graphite = part(new THREE.ConeGeometry(0.044, 0.15, 12), lead, 0.075);
  graphite.rotation.z = Math.PI;
  part(new THREE.CylinderGeometry(0.119, 0.04, 0.37, 6), wood, 0.325);
  part(new THREE.CylinderGeometry(0.119, 0.119, 2.25, 6), yellow, 1.635);
  part(new THREE.CylinderGeometry(0.122, 0.122, 0.22, 32), silver, 2.87);
  for (const y of [2.8, 2.87, 2.94]) {
    const ring = part(new THREE.TorusGeometry(0.122, 0.009, 6, 32), silver, y);
    ring.rotation.x = Math.PI / 2;
  }
  part(new THREE.CylinderGeometry(0.12, 0.12, 0.22, 24), pink, 3.08);
  part(
    new THREE.SphereGeometry(0.12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    pink,
    3.19,
  );
  pencil.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0.53, 1, -0.2).normalize(),
  );

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let paused = reducedMotion.matches;
  let inView = true;
  let disposed = false;
  let elapsed = 0;
  let previousTime = 0;
  let lastPaint = -1;
  let lastPage = -1;
  let frame = 0;
  const point = new THREE.Vector3();

  function pose(time: number) {
    const motion = sampleDeskMotion(time);
    const { slide, fall, ink: writing } = motion;
    sheet.visible = motion.sheetVisible;
    sheet.position.set(
      slide * 0.35,
      paperHeight - fall * fall * 3.6,
      slide * 4.5,
    );
    sheet.rotation.set(-fall * 0.45, fall * -0.22, fall * -0.32);
    for (let i = 0; i < sheetPositions.count; i++) {
      const x = originalPositions[i * 3];
      const z = originalPositions[i * 3 + 2];
      const overhang = Math.max(0, z + sheet.position.z - 1.92);
      const bend = Math.min(overhang, 1.8);
      sheetPositions.setZ(i, z - bend + Math.sin(bend));
      sheetPositions.setY(
        i,
        -(1 - Math.cos(bend)) + Math.sin(x * 2 + time * 3) * fall * 0.08,
      );
    }
    sheetPositions.needsUpdate = true;
    sheetGeometry.computeVertexNormals();
    if (
      motion.page !== lastPage ||
      Math.abs(writing - lastPaint) > 0.004 ||
      writing < lastPaint ||
      (writing === 1 && lastPaint !== 1)
    ) {
      paintSheet(writing, motion.page);
      lastPage = motion.page;
      lastPaint = writing;
    }
    point.set(
      (motion.x / 640 - 0.5) * paperWidth,
      paperHeight + 0.018 + motion.lift,
      (motion.y / 800 - 0.5) * paperDepth,
    );
    stack.localToWorld(point);
    pencil.position.copy(point);
    renderer.render(scene, camera);
  }

  function render(now: number) {
    if (disposed) return;
    const delta = previousTime
      ? Math.min((now - previousTime) / 1000, 0.05)
      : 0;
    previousTime = now;
    elapsed += delta;
    pose(elapsed);
    frame = requestAnimationFrame(render);
  }
  function syncPlayback() {
    cancelAnimationFrame(frame);
    previousTime = 0;
    if (!paused && inView && !document.hidden && !disposed)
      frame = requestAnimationFrame(render);
  }
  const resize = new ResizeObserver(() => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    const aspect = width / height;
    camera.left = -3.7 * aspect;
    camera.right = 3.7 * aspect;
    camera.updateProjectionMatrix();
    pose(elapsed);
  });
  resize.observe(host);
  const intersection = new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      syncPlayback();
    },
    { threshold: 0.05 },
  );
  intersection.observe(host);
  document.addEventListener("visibilitychange", syncPlayback);
  renderer.setSize(host.clientWidth, host.clientHeight);
  pose(elapsed);
  onReady();
  syncPlayback();

  return {
    setPaused(value: boolean) {
      paused = value;
      syncPlayback();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", syncPlayback);
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          for (const mat of Array.isArray(object.material)
            ? object.material
            : [object.material])
            materials.add(mat);
        }
      });
      materials.forEach((mat) => mat.dispose());
      sheetTexture.dispose();
      shadowTexture.dispose();
      key.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
