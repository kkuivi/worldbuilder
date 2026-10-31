import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  GRID_H,
  GRID_W,
  TERRAIN_HEIGHT,
  type Entity,
  type SpriteId,
  type Terrain,
  type WorldState,
} from "@worldbuilder/contracts";

const TILE_COLOR: Record<Terrain, number> = {
  grass: 0x3e9a48,
  water: 0x2d74c8,
  sand: 0xefd39a,
  stone: 0x66717c,
  snow: 0xf4f8fc,
  dirt: 0xb88858,
};

const SPIN = new Set<SpriteId>([
  "tree_oak",
  "tree_pine",
  "bush",
  "flower",
  "rock",
  "stump",
  "animal_cat",
  "animal_dog",
  "npc_villager",
  "npc_knight",
  "npc_merchant",
  "npc_child",
]);

export interface ScenePulse {
  tiles: Array<{ x: number; y: number }>;
  color: string;
  at: number;
}

export interface WorldScene {
  sync(world: WorldState, selectedId: string | null, births: Record<string, number>, pulse: ScenePulse | null): void;
  dispose(): void;
}

export function createScene(canvas: HTMLCanvasElement, onSelect: (id: string | null) => void): WorldScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0xb7d4ec);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  camera.position.set(GRID_W * 0.72, 9, GRID_H + 7);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(GRID_W / 2, 0.35, GRID_H * 0.42);
  controls.enableDamping = true;
  controls.screenSpacePanning = false;
  controls.maxPolarAngle = Math.PI / 2.08;
  controls.minDistance = 8;
  controls.maxDistance = 72;
  controls.update();

  let userMoved = false;
  controls.addEventListener("start", () => {
    userMoved = true;
  });

  scene.add(new THREE.HemisphereLight(0xd6ecff, 0x6a8f4a, 0.55));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const sun = new THREE.DirectionalLight(0xfff6e4, 1.25);
  sun.position.set(8, 18, 10);
  scene.add(sun);

  const terrain = new THREE.Group();
  const props = new THREE.Group();
  const pulses = new THREE.Group();
  scene.add(terrain, props, pulses);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.78, 28),
    new THREE.MeshBasicMaterial({ color: 0xfffaf2, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  ring.renderOrder = 2;
  scene.add(ring);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let world: WorldState | null = null;
  let selectedId: string | null = null;
  let births: Record<string, number> = {};
  let builtVersion = -1;
  let seenPulse = 0;
  let viewW = 0;
  let viewH = 0;
  let pointerDown: { x: number; y: number } | null = null;

  function frameWorld() {
    const aspect = Math.max(camera.aspect || 1, 0.55);
    const halfFov = ((camera.fov * Math.PI) / 180) / 2;
    const distance = Math.max(16, 20 / (Math.tan(halfFov) * aspect));
    const direction = new THREE.Vector3(0.22, 0.58, 1);
    const length = Math.hypot(direction.x, direction.y, direction.z);
    camera.position.set(
      controls.target.x + (direction.x / length) * distance,
      controls.target.y + (direction.y / length) * distance,
      controls.target.z + (direction.z / length) * distance,
    );
    controls.update();
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width < 2 || height < 2 || (width === viewW && height === viewH)) return;
    viewW = width;
    viewH = height;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (!userMoved) frameWorld();
  }

  function surface(x: number, y: number) {
    const cell = world?.terrain[y]?.[x];
    return cell ? TERRAIN_HEIGHT[cell] : TERRAIN_HEIGHT.grass;
  }

  function standHeight(entity: Entity) {
    if (entity.sprite === "bridge") return bankHeight(entity);
    let top = 0;
    for (let y = entity.y; y < entity.y + entity.h; y += 1) {
      for (let x = entity.x; x < entity.x + entity.w; x += 1) top = Math.max(top, surface(x, y));
    }
    return top;
  }

  function bankHeight(entity: Entity) {
    let top = TERRAIN_HEIGHT.sand;
    for (let y = entity.y - 1; y <= entity.y + entity.h; y += 1) {
      for (let x = entity.x - 1; x <= entity.x + entity.w; x += 1) {
        const cell = world?.terrain[y]?.[x];
        if (cell && cell !== "water") top = Math.max(top, TERRAIN_HEIGHT[cell]);
      }
    }
    return top;
  }

  function rebuild() {
    clearGroup(terrain);
    clearGroup(props);
    if (!world) return;
    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const kind = world.terrain[y]?.[x] ?? "grass";
        const height = TERRAIN_HEIGHT[kind];
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.96, height, 0.96), lambert(tileColor(kind, x, y)));
        mesh.position.set(x + 0.5, height / 2, y + 0.5);
        mesh.userData.water = kind === "water";
        mesh.userData.baseY = height / 2;
        terrain.add(mesh);
      }
    }
    for (const entity of world.entities) {
      const group = buildEntity(entity);
      group.position.set(entity.x + entity.w / 2, standHeight(entity), entity.y + entity.h / 2);
      props.add(group);
    }
  }

  function showPulse(pulse: ScenePulse) {
    clearGroup(pulses);
    const color = new THREE.Color(pulse.color);
    const seen = new Set<string>();
    for (const tile of pulse.tiles) {
      const key = `${tile.x},${tile.y}`;
      if (seen.has(key) || tile.x < 0 || tile.y < 0 || tile.x >= GRID_W || tile.y >= GRID_H) continue;
      seen.add(key);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.98, 0.07, 0.98),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }),
      );
      mesh.position.set(tile.x + 0.5, surface(tile.x, tile.y) + 0.05, tile.y + 0.5);
      mesh.userData.until = pulse.at + 700;
      pulses.add(mesh);
    }
  }

  function pick(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(props.children, true);
    let node: THREE.Object3D | null = hits[0]?.object ?? null;
    while (node && node.userData.id == null) node = node.parent;
    onSelect(typeof node?.userData.id === "string" ? node.userData.id : null);
  }

  const onPointerDown = (event: PointerEvent) => {
    pointerDown = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!pointerDown) return;
    const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    pointerDown = null;
    if (moved > 6) return;
    pick(event.clientX, event.clientY);
  };
  const onContext = (event: Event) => event.preventDefault();
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("contextmenu", onContext);

  const clock = new THREE.Clock();
  let raf = 0;
  const frame = () => {
    resize();
    const time = clock.getElapsedTime();
    const now = performance.now();
    if (!reduceMotion) {
      for (const child of terrain.children) {
        const mesh = child as THREE.Mesh;
        if (mesh.userData.water) mesh.position.y = Number(mesh.userData.baseY) + Math.sin(time * 2 + mesh.position.x * 0.7) * 0.018;
      }
    }
    for (const child of props.children) {
      const born = births[String(child.userData.id)] ?? now - 1000;
      const age = reduceMotion ? 1 : Math.min(1, Math.max(0, (now - born) / 240));
      const scale = 0.15 + 0.85 * (1 - (1 - age) * (1 - age));
      child.scale.setScalar(scale);
      child.traverse((node) => {
        if (node instanceof THREE.Mesh && node.userData.flame) {
          const flicker = 0.82 + Math.sin(time * 9 + node.id) * 0.18;
          node.scale.set(1, flicker, 1);
        }
      });
    }
    for (const child of [...pulses.children]) {
      const mesh = child as THREE.Mesh;
      const left = (Number(mesh.userData.until) - now) / 700;
      if (left <= 0) {
        disposeObject(mesh);
        pulses.remove(mesh);
      } else if (mesh.material instanceof THREE.MeshBasicMaterial) {
        mesh.material.opacity = Math.max(0, left);
      }
    }

    const selected = props.children.find((child) => child.userData.id === selectedId);
    props.traverse((node) => {
      if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshLambertMaterial) {
        node.material.emissive.setHex(selected && node.parent && belongsTo(node, selected) ? 0x4a3418 : 0x000000);
      }
    });
    if (selected && world) {
      const entity = world.entities.find((item) => item.id === selectedId);
      ring.visible = true;
      ring.position.set(selected.position.x, selected.position.y + 0.06, selected.position.z);
      ring.scale.setScalar(entity ? Math.max(entity.w, entity.h) : 1);
    } else {
      ring.visible = false;
    }

    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    sync(next, nextSelected, nextBirths, pulse) {
      world = next;
      selectedId = nextSelected;
      births = nextBirths;
      if (next.version !== builtVersion) {
        rebuild();
        builtVersion = next.version;
      }
      if (pulse && pulse.at !== seenPulse) {
        seenPulse = pulse.at;
        showPulse(pulse);
      }
    },
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("contextmenu", onContext);
      controls.dispose();
      clearGroup(terrain);
      clearGroup(props);
      clearGroup(pulses);
      ring.geometry.dispose();
      if (ring.material instanceof THREE.Material) ring.material.dispose();
      renderer.dispose();
    },
  };
}

function belongsTo(node: THREE.Object3D, root: THREE.Object3D) {
  let current: THREE.Object3D | null = node;
  while (current) {
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

function buildEntity(entity: Entity) {
  const group = new THREE.Group();
  group.userData.id = entity.id;
  const sx = entity.w * 0.86;
  const sz = entity.h * 0.86;
  shape(group, entity.sprite, sx, sz);
  if (SPIN.has(entity.sprite)) group.rotation.y = yaw(entity.id);
  return group;
}

function shape(group: THREE.Group, sprite: SpriteId, sx: number, sz: number) {
  switch (sprite) {
    case "tree_oak": {
      const radius = Math.max(sx, sz) * 0.46;
      cylinder(group, radius * 0.22, 0.75, 0x5c3a22, 0, 0.38, 0);
      sphere(group, radius, 0x2f8f3a, 0, 1.05, 0);
      sphere(group, radius * 0.62, 0x8ed56a, radius * 0.28, 1.28, radius * 0.08);
      return;
    }
    case "tree_pine": {
      const radius = Math.max(sx, sz) * 0.42;
      cylinder(group, radius * 0.2, 0.5, 0x5c3a22, 0, 0.25, 0);
      cone(group, radius, 1.15, 0x1d5c28, 0, 1.05, 0);
      cone(group, radius * 0.72, 0.7, 0x2f8f3a, 0, 1.55, 0);
      return;
    }
    case "bush":
      sphere(group, Math.min(sx, sz) * 0.42, 0x2f8f3a, 0, 0.28, 0);
      sphere(group, Math.min(sx, sz) * 0.24, 0x8ed56a, 0.16, 0.4, 0.05);
      return;
    case "flower":
      cylinder(group, 0.035, 0.28, 0x2d7a38, 0, 0.14, 0);
      sphere(group, 0.11, 0xe85d75, 0, 0.32, 0);
      return;
    case "rock": {
      const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(Math.min(sx, sz) * 0.38), lambert(0xc5ced6));
      mesh.position.y = 0.22;
      mesh.scale.y = 0.75;
      group.add(mesh);
      return;
    }
    case "stump":
      cylinder(group, 0.22, 0.28, 0x8d5a32, 0, 0.14, 0);
      cylinder(group, 0.26, 0.06, 0x5c3a22, 0, 0.28, 0);
      return;
    case "house_small":
      house(group, sx, sz, 0xf6e6c8, 0xd4543c);
      return;
    case "house_large":
      house(group, sx, sz, 0xe4cfa6, 0x8c3428);
      return;
    case "tower":
      box(group, sx * 0.55, 2.15, sz * 0.55, 0xc5ced6, 0, 1.08, 0);
      cone(group, sx * 0.42, 0.72, 0x8c3428, 0, 2.5, 0);
      box(group, 0.22, 0.36, 0.08, 0x5c3a22, 0, 0.2, sz * 0.28);
      return;
    case "castle": {
      box(group, sx * 0.62, 1.2, sz * 0.62, 0x9aa3ad, 0, 0.6, 0);
      box(group, sx * 0.72, 0.12, sz * 0.72, 0x66717c, 0, 1.22, 0);
      const ox = sx * 0.38;
      const oz = sz * 0.38;
      for (const [x, z] of [
        [-ox, -oz],
        [ox, -oz],
        [-ox, oz],
        [ox, oz],
      ]) {
        box(group, 0.46, 1.75, 0.46, 0x6e7782, x, 0.88, z);
        box(group, 0.56, 0.12, 0.56, 0x4e575f, x, 1.78, z);
      }
      box(group, 0.36, 0.52, 0.08, 0x5c3a22, 0, 0.26, sz * 0.32);
      return;
    }
    case "well": {
      cylinder(group, 0.28, 0.36, 0xc5ced6, 0, 0.18, 0);
      cylinder(group, 0.16, 0.08, 0x2d74c8, 0, 0.34, 0);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 6, 14), lambert(0x66717c));
      lip.rotation.x = Math.PI / 2;
      lip.position.y = 0.36;
      group.add(lip);
      return;
    }
    case "fence":
      box(group, 0.08, 0.42, 0.08, 0x8d5a32, -sx * 0.32, 0.21, 0);
      box(group, 0.08, 0.42, 0.08, 0x8d5a32, sx * 0.32, 0.21, 0);
      box(group, sx * 0.72, 0.08, 0.06, 0xc48945, 0, 0.34, 0);
      return;
    case "bridge":
      box(group, sx, 0.16, Math.max(0.42, sz * 0.7), 0xc48945, 0, 0.08, 0);
      box(group, sx, 0.16, 0.08, 0x8d5a32, 0, 0.26, sz * 0.28);
      box(group, sx, 0.16, 0.08, 0x8d5a32, 0, 0.26, -sz * 0.28);
      return;
    case "road":
      box(group, 0.92, 0.08, 0.92, 0x8d643c, 0, 0.05, 0);
      return;
    case "sign":
      cylinder(group, 0.05, 0.7, 0x8d5a32, 0, 0.35, 0);
      box(group, 0.46, 0.28, 0.06, 0xf6e6c8, 0, 0.62, 0.04);
      return;
    case "campfire": {
      const left = box(group, 0.42, 0.08, 0.1, 0x5c3a22, 0, 0.08, 0);
      left.rotation.y = 0.7;
      const right = box(group, 0.42, 0.08, 0.1, 0x8d5a32, 0, 0.12, 0);
      right.rotation.y = -0.6;
      const flame = cone(group, 0.12, 0.34, 0xff8a3d, 0, 0.34, 0);
      flame.userData.flame = true;
      return;
    }
    case "boat":
      box(group, sx * 0.82, 0.2, sz * 0.5, 0x8d5a32, 0, 0.08, 0);
      box(group, 0.06, 0.62, 0.06, 0xf6e6c8, -sx * 0.08, 0.42, 0);
      box(group, 0.02, 0.4, 0.28, 0xf4f8fc, 0.02, 0.48, 0);
      return;
    case "npc_villager":
      person(group, 0x3b6fe0, 1);
      return;
    case "npc_knight":
      person(group, 0x66717c, 1.05);
      box(group, 0.16, 0.1, 0.16, 0xc5ced6, 0, 0.92, 0);
      return;
    case "npc_merchant":
      person(group, 0xc48945, 1);
      box(group, 0.18, 0.08, 0.12, 0xefb423, 0.16, 0.48, 0);
      return;
    case "npc_child":
      person(group, 0xefb423, 0.68);
      return;
    case "animal_cat":
      animal(group, 0xc48945, 0.7);
      return;
    case "animal_dog":
      animal(group, 0x8d643c, 0.85);
      return;
    default:
      box(group, sx, 0.4, sz, 0xc5ced6, 0, 0.2, 0);
  }
}

function house(group: THREE.Group, sx: number, sz: number, wall: number, roof: number) {
  box(group, sx, 0.72, sz, wall, 0, 0.36, 0);
  cone(group, Math.max(sx, sz) * 0.64, 0.58, roof, 0, 1.01, 0);
  box(group, Math.min(0.28, sx * 0.22), 0.4, 0.08, 0x5c3a22, 0, 0.2, sz / 2 + 0.01);
  box(group, 0.16, 0.32, 0.16, 0x66717c, sx * 0.28, 0.78, -sz * 0.12);
}

function person(group: THREE.Group, cloth: number, scale: number) {
  box(group, 0.26 * scale, 0.4 * scale, 0.16 * scale, cloth, 0, 0.42 * scale, 0);
  sphere(group, 0.14 * scale, 0xf0c59a, 0, 0.74 * scale, 0);
  box(group, 0.08 * scale, 0.26 * scale, 0.08 * scale, 0x3d342c, -0.07 * scale, 0.13 * scale, 0);
  box(group, 0.08 * scale, 0.26 * scale, 0.08 * scale, 0x3d342c, 0.07 * scale, 0.13 * scale, 0);
}

function animal(group: THREE.Group, color: number, scale: number) {
  box(group, 0.42 * scale, 0.2 * scale, 0.18 * scale, color, 0, 0.16 * scale, 0);
  sphere(group, 0.1 * scale, color, 0.2 * scale, 0.24 * scale, 0);
}

function tileColor(kind: Terrain, x: number, y: number) {
  const n = hash(x, y) % 3;
  if (kind === "grass") return [0x3e9a48, 0x46a250, 0x348643][n] ?? TILE_COLOR.grass;
  if (kind === "sand") return [0xefd39a, 0xe6c56e, 0xf7e4b8][n] ?? TILE_COLOR.sand;
  if (kind === "stone") return [0x66717c, 0x73808a, 0x5c6770][n] ?? TILE_COLOR.stone;
  return TILE_COLOR[kind];
}

function hash(x: number, y: number) {
  return Math.abs((Math.imul(x + 19, 73856093) ^ Math.imul(y + 7, 19349663)) >>> 0);
}

function yaw(id: string) {
  let n = 0;
  for (const char of id) n = (n * 33 + char.charCodeAt(0)) % 628;
  return n / 100;
}

function lambert(color: number) {
  return new THREE.MeshLambertMaterial({ color });
}

function box(group: THREE.Group, width: number, height: number, depth: number, color: number, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), lambert(color));
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function cylinder(group: THREE.Group, radius: number, height: number, color: number, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 8), lambert(color));
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function cone(group: THREE.Group, radius: number, height: number, color: number, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 8), lambert(color));
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function sphere(group: THREE.Group, radius: number, color: number, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), lambert(color));
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function clearGroup(group: THREE.Group) {
  for (const child of group.children) disposeObject(child);
  group.clear();
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    const material = node.material;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material.dispose();
  });
}
