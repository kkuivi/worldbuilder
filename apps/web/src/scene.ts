import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  GRID_H,
  GRID_W,
  ROOM_H,
  ROOM_W,
  TERRAIN_HEIGHT,
  airborne,
  inventModel,
  modelFor,
  namedColor,
  parseModel,
  portrayal,
  type Entity,
  type ModelPart,
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
  sync(world: WorldState, selectedId: string | null, births: Record<string, number>, pulse: ScenePulse | null, insideId?: string | null, tile?: { x: number; y: number; w: number; h: number } | null): void;
  dispose(): void;
}

export function createScene(
  canvas: HTMLCanvasElement,
  onSelect: (id: string | null) => void,
  onMove: (id: string, x: number, y: number) => Promise<boolean> | boolean,
  onTile: (tile: { x: number; y: number; w: number; h: number } | null) => void,
): WorldScene {
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
  controls.mouseButtons.RIGHT = 0;
  controls.update();

  let userMoved = false;
  controls.addEventListener("start", () => {
    userMoved = true;
  });

  const hemi = new THREE.HemisphereLight(0xd6ecff, 0x6a8f4a, 0.55);
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  const sun = new THREE.DirectionalLight(0xfff6e4, 1.25);
  sun.position.set(8, 18, 10);
  const stars = new THREE.Group();
  for (let i = 0; i < 40; i += 1) {
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.045, 4, 4), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
    const angle = (i / 40) * Math.PI * 2;
    const radius = 7 + (i % 6) * 1.6;
    star.position.set(GRID_W / 2 + Math.cos(angle) * radius, 7 + (i % 4) * 0.7, GRID_H / 2 + Math.sin(angle) * radius * 0.55);
    stars.add(star);
  }
  stars.visible = false;
  scene.add(hemi, ambient, sun, stars);

  function applySky(sky: WorldState["sky"]) {
    const night = sky === "night";
    renderer.setClearColor(night ? 0x0b1020 : 0xb7d4ec);
    hemi.color.set(night ? 0x243456 : 0xd6ecff);
    hemi.groundColor.set(night ? 0x12160f : 0x6a8f4a);
    hemi.intensity = night ? 0.28 : 0.55;
    ambient.color.set(night ? 0x8ea0c4 : 0xffffff);
    ambient.intensity = night ? 0.16 : 0.35;
    sun.color.set(night ? 0xb7c7e6 : 0xfff6e4);
    sun.intensity = night ? 0.28 : 1.25;
    stars.visible = night && !insideNow;
    if (insideNow) {
      renderer.setClearColor(0x1c1916);
      hemi.color.set(0xfff1d6);
      hemi.groundColor.set(0xc4a574);
      hemi.intensity = 0.72;
      ambient.color.set(0xfff6e8);
      ambient.intensity = 0.42;
      sun.intensity = 0.45;
    }
  }

  const terrain = new THREE.Group();
  const props = new THREE.Group();
  const pulses = new THREE.Group();
  const areaMarks = new THREE.Group();
  scene.add(terrain, props, pulses, areaMarks);

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
  let selectedTile: { x: number; y: number; w: number; h: number } | null = null;
  let births: Record<string, number> = {};
  let builtKey = "";
  let insideNow: string | null = null;
  let seenPulse = 0;
  let viewW = 0;
  let viewH = 0;
  let pointerDown: { x: number; y: number } | null = null;

  function frameWorld() {
    controls.target.set(GRID_W / 2, 0.35, GRID_H * 0.42);
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

  function frameView() {
    if (insideNow) frameRoom();
    else frameWorld();
  }

  function frameRoom() {
    controls.target.set(ROOM_W / 2, 0.35, ROOM_H / 2);
    camera.position.set(ROOM_W / 2 + 1.6, 6.4, ROOM_H + 4.2);
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
    if (!userMoved) frameView();
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

  function addPlaced(entity: Entity, ground: number) {
    const group = buildEntity(entity);
    group.position.set(entity.x + entity.w / 2, ground, entity.y + entity.h / 2);
    if (!insideNow && airborne(`${entity.label} ${entity.note ?? ""}`)) {
      group.userData.fly = true;
      group.userData.homeX = group.position.x;
      group.userData.homeY = group.position.y;
      group.userData.homeZ = group.position.z;
      let phase = 0;
      for (const char of entity.id) phase += char.charCodeAt(0);
      group.userData.phase = phase;
    }
    props.add(group);
  }

  function drawInterior(insideId: string) {
    for (let y = 0; y < ROOM_H; y += 1) {
      for (let x = 0; x < ROOM_W; x += 1) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.16, 0.98), lambert((x + y) % 2 === 0 ? 0xc4a574 : 0xb8956a));
        mesh.position.set(x + 0.5, 0.08, y + 0.5);
        mesh.userData.cellX = x;
        mesh.userData.cellY = y;
        terrain.add(mesh);
      }
    }
    const plaster = 0xf4efe4;
    const wall = (x: number, z: number, w: number, d: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 1.15, d), lambert(plaster));
      mesh.position.set(x, 0.72, z);
      terrain.add(mesh);
    };
    wall(ROOM_W / 2, -0.08, ROOM_W + 0.2, 0.16);
    wall(-0.08, ROOM_H / 2, 0.16, ROOM_H);
    wall(ROOM_W + 0.08, ROOM_H / 2, 0.16, ROOM_H);
    wall(1.4, ROOM_H + 0.08, 2.8, 0.16);
    wall(ROOM_W - 1.4, ROOM_H + 0.08, 2.8, 0.16);
    for (const x of [2.2, ROOM_W - 2.2]) {
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.06), new THREE.MeshBasicMaterial({ color: 0x9fd4ef }));
      glass.position.set(x, 0.85, -0.02);
      terrain.add(glass);
    }
    for (const entity of world?.entities ?? []) {
      if (entity.inside !== insideId) continue;
      addPlaced(entity, 0.2);
    }
    const guests = (world?.players ?? []).filter((player) => player.inside === insideId);
    guests.forEach((player, index) => {
      const group = new THREE.Group();
      const color = Number.parseInt(player.color.replace("#", ""), 16);
      person(group, Number.isFinite(color) ? color : 0xe85d4c, 0.62);
      group.position.set(ROOM_W / 2 + (index - (guests.length - 1) / 2) * 0.55, 0.16, ROOM_H - 0.7);
      props.add(group);
    });
  }

  function rebuild() {
    clearGroup(terrain);
    clearGroup(props);
    if (!world) return;
    if (insideNow) {
      drawInterior(insideNow);
      return;
    }
    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const kind = world.terrain[y]?.[x] ?? "grass";
        const height = TERRAIN_HEIGHT[kind];
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.96, height, 0.96), lambert(tileColor(kind, x, y)));
        mesh.position.set(x + 0.5, height / 2, y + 0.5);
        mesh.userData.water = kind === "water";
        mesh.userData.baseY = height / 2;
        mesh.userData.cellX = x;
        mesh.userData.cellY = y;
        terrain.add(mesh);
      }
    }
    for (const entity of world.entities) {
      if (entity.inside) continue;
      addPlaced(entity, standHeight(entity));
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

  function aim(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    return true;
  }

  function pickId(clientX: number, clientY: number): string | null {
    if (!aim(clientX, clientY)) return null;
    const hits = raycaster.intersectObjects(props.children, true);
    let node: THREE.Object3D | null = hits[0]?.object ?? null;
    while (node && node.userData.id == null) node = node.parent;
    return typeof node?.userData.id === "string" ? node.userData.id : null;
  }

  function tileAt(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!aim(clientX, clientY)) return null;
    const hits = raycaster.intersectObjects(terrain.children, false);
    for (const hit of hits) {
      const x = hit.object.userData.cellX;
      const y = hit.object.userData.cellY;
      if (typeof x === "number" && typeof y === "number") return { x, y };
    }
    return null;
  }

  function fits(entity: Entity, x: number, y: number) {
    const width = insideNow ? ROOM_W : GRID_W;
    const height = insideNow ? ROOM_H : GRID_H;
    return x >= 0 && y >= 0 && x + entity.w <= width && y + entity.h <= height;
  }

  function placePreview(id: string, x: number, y: number, lift: boolean) {
    const entity = world?.entities.find((item) => item.id === id);
    const group = props.children.find((child) => child.userData.id === id);
    if (!entity || !group) return;
    const ground = insideNow ? 0.2 : standHeight({ ...entity, x, y });
    group.position.set(x + entity.w / 2, ground + (lift ? 0.35 : 0), y + entity.h / 2);
  }

  let drag: { id: string; originX: number; originY: number; grabX: number; grabY: number; x: number; y: number; moved: boolean } | null = null;
  let regionDrag: { x: number; y: number; ax: number; ay: number } | null = null;
  let shownMarks = "";

  function selectionBox(x0: number, y0: number, x1: number, y1: number) {
    const x = Math.min(x0, x1);
    const y = Math.min(y0, y1);
    return { x, y, w: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1 };
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    pointerDown = { x: event.clientX, y: event.clientY };
    const id = pickId(event.clientX, event.clientY);
    const entity = id ? world?.entities.find((item) => item.id === id) : undefined;
    const tile = entity ? tileAt(event.clientX, event.clientY) : null;
    if (id && entity && tile) {
      drag = { id, originX: entity.x, originY: entity.y, grabX: tile.x, grabY: tile.y, x: entity.x, y: entity.y, moved: false };
      controls.enabled = false;
      onSelect(id);
      onTile(null);
      event.stopPropagation();
      return;
    }
    const ground = tileAt(event.clientX, event.clientY);
    if (!ground) return;
    regionDrag = { x: ground.x, y: ground.y, ax: ground.x, ay: ground.y };
    controls.enabled = false;
    event.stopPropagation();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag || !pointerDown) return;
    const tile = tileAt(event.clientX, event.clientY);
    const entity = world?.entities.find((item) => item.id === drag?.id);
    if (!tile || !entity || !drag) return;
    const x = drag.originX + (tile.x - drag.grabX);
    const y = drag.originY + (tile.y - drag.grabY);
    if (!fits(entity, x, y)) return;
    if (x !== drag.originX || y !== drag.originY) drag.moved = true;
    drag.x = x;
    drag.y = y;
    placePreview(drag.id, x, y, true);
  };
  const onRegionMove = (event: PointerEvent) => {
    if (!regionDrag) return;
    const tile = tileAt(event.clientX, event.clientY);
    if (!tile) return;
    regionDrag = { ...regionDrag, ax: tile.x, ay: tile.y };
  };
  const onPointerUp = (event: PointerEvent) => {
    const drop = drag;
    const region = regionDrag;
    drag = null;
    regionDrag = null;
    controls.enabled = true;
    if (region) {
      pointerDown = null;
      onSelect(null);
      onTile(selectionBox(region.x, region.y, region.ax, region.ay));
      return;
    }
    if (!pointerDown) return;
    const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    pointerDown = null;
    if (drop?.moved) {
      void Promise.resolve(onMove(drop.id, drop.x, drop.y)).then((ok) => {
        if (!ok) placePreview(drop.id, drop.originX, drop.originY, false);
      });
      return;
    }
    if (drop || moved > 6) return;
    const id = pickId(event.clientX, event.clientY);
    if (id) {
      onSelect(id);
      onTile(null);
      return;
    }
    onSelect(null);
    onTile(tileAt(event.clientX, event.clientY));
  };
  const onContext = (event: Event) => event.preventDefault();
  canvas.addEventListener("pointerdown", onPointerDown, true);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointermove", onRegionMove);
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
      if (child.userData.fly && drag?.id !== child.userData.id) {
        const phase = Number(child.userData.phase ?? 0);
        if (reduceMotion) {
          child.position.y = Number(child.userData.homeY) + 1.7;
        } else {
          const angle = time * 0.85 + phase;
          child.position.x = Number(child.userData.homeX) + Math.cos(angle) * 1.25;
          child.position.z = Number(child.userData.homeZ) + Math.sin(angle) * 1.25;
          child.position.y = Number(child.userData.homeY) + 1.65 + Math.sin(time * 2.2 + phase) * 0.2;
          child.rotation.y = angle;
        }
      }
      child.traverse((node) => {
        if (node instanceof THREE.Mesh && node.userData.flame) {
          const flicker = 0.82 + Math.sin(time * 9 + node.id) * 0.18;
          node.scale.set(1, flicker, 1);
        }
        if (!reduceMotion && child.userData.fly && node instanceof THREE.Mesh && node.userData.wing) {
          node.rotation.x = Math.sin(time * 12) * 0.7 * Number(node.userData.wing);
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
    const draft = regionDrag ? selectionBox(regionDrag.x, regionDrag.y, regionDrag.ax, regionDrag.ay) : null;
    const marked = draft && draft.w * draft.h > 1 ? draft : selectedTile && selectedTile.w * selectedTile.h > 1 ? selectedTile : null;
    const nextMarks = marked ? `${marked.x},${marked.y},${marked.w},${marked.h},${insideNow ?? ""}` : "";
    if (nextMarks !== shownMarks) {
      shownMarks = nextMarks;
      clearGroup(areaMarks);
      if (marked) {
        for (let y = marked.y; y < marked.y + marked.h; y += 1) {
          for (let x = marked.x; x < marked.x + marked.w; x += 1) {
            const mesh = new THREE.Mesh(
              new THREE.BoxGeometry(0.92, 0.05, 0.92),
              new THREE.MeshBasicMaterial({ color: 0xe85d4c, transparent: true, opacity: 0.45, depthWrite: false }),
            );
            mesh.position.set(x + 0.5, (insideNow ? 0.2 : surface(x, y)) + 0.06, y + 0.5);
            areaMarks.add(mesh);
          }
        }
      }
    }
    if (ring.material instanceof THREE.MeshBasicMaterial) ring.material.color.setHex(selected ? 0xfffaf2 : 0xe85d4c);
    if (selected && world) {
      const entity = world.entities.find((item) => item.id === selectedId);
      ring.visible = true;
      ring.position.set(selected.position.x, selected.position.y + 0.06, selected.position.z);
      ring.scale.setScalar(entity ? Math.max(entity.w, entity.h) : 1);
    } else if (selectedTile && selectedTile.w * selectedTile.h === 1 && !draft) {
      const ground = insideNow ? 0.2 : surface(selectedTile.x, selectedTile.y);
      ring.visible = true;
      ring.position.set(selectedTile.x + 0.5, ground + 0.08, selectedTile.y + 0.5);
      ring.scale.setScalar(1);
    } else {
      ring.visible = false;
    }

    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    sync(next, nextSelected, nextBirths, pulse, insideId: string | null = null, tile: { x: number; y: number; w: number; h: number } | null = null) {
      world = next;
      selectedId = nextSelected;
      selectedTile = tile;
      births = nextBirths;
      const entered = insideNow !== insideId;
      insideNow = insideId;
      applySky(next.sky);
      const key = `${next.version}:${insideId ?? ""}`;
      if (key !== builtKey) {
        rebuild();
        builtKey = key;
      }
      if (entered) {
        userMoved = false;
        controls.minDistance = insideId ? 3 : 8;
        frameView();
      }
      if (!insideNow && pulse && pulse.at !== seenPulse) {
        seenPulse = pulse.at;
        showPulse(pulse);
      }
    },
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointermove", onRegionMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("contextmenu", onContext);
      controls.dispose();
      clearGroup(terrain);
      clearGroup(props);
      clearGroup(pulses);
      clearGroup(areaMarks);
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
  const spec = modelSpec(entity);
  if (spec) {
    drawModel(group, spec);
    group.rotation.y = yaw(entity.id);
    return group;
  }
  const kind = likeness(entity.label) ?? (entity.sprite === "sign" ? likeness(entity.note ?? "") : null);
  if (kind) {
    drawLikeness(group, kind, `${entity.label} ${entity.note ?? ""}`);
    group.rotation.y = yaw(entity.id);
  } else if (entity.sprite === "sign" && entity.label.trim().toLowerCase() !== "sign") {
    drawVaried(group, entity.label);
    group.rotation.y = yaw(entity.id);
  } else {
    shape(group, entity.sprite, sx, sz, entity.label);
    if (SPIN.has(entity.sprite)) group.rotation.y = yaw(entity.id);
  }
  return group;
}

function shape(group: THREE.Group, sprite: SpriteId, sx: number, sz: number, label = "") {
  switch (sprite) {
    case "tree_oak": {
      const radius = Math.max(sx, sz) * 0.46;
      const leaf = namedColor(label) ?? 0x2f8f3a;
      const tip = namedColor(label) ?? 0x8ed56a;
      cylinder(group, radius * 0.22, 0.75, 0x5c3a22, 0, 0.38, 0);
      sphere(group, radius, leaf, 0, 1.05, 0);
      sphere(group, radius * 0.62, tip, radius * 0.28, 1.28, radius * 0.08);
      return;
    }
    case "tree_pine": {
      const radius = Math.max(sx, sz) * 0.42;
      const leaf = namedColor(label) ?? 0x1d5c28;
      const tip = namedColor(label) ?? 0x2f8f3a;
      cylinder(group, radius * 0.2, 0.5, 0x5c3a22, 0, 0.25, 0);
      cone(group, radius, 1.15, leaf, 0, 1.05, 0);
      cone(group, radius * 0.72, 0.7, tip, 0, 1.55, 0);
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
    case "road": {
      const length = Math.max(sx, 0.92);
      const width = Math.max(Math.min(sx, sz) * 0.55, 0.46);
      const alongX = sx >= sz;
      box(group, alongX ? length : width, 0.12, alongX ? width : length, 0x5a5146, 0, 0.1, 0);
      box(group, alongX ? length * 0.86 : 0.1, 0.03, alongX ? 0.1 : length * 0.86, 0xe7d7a8, 0, 0.17, 0);
      return;
    }
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
      flame.material = new THREE.MeshBasicMaterial({ color: 0xff8a3d });
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
      cylinder(group, Math.min(sx, sz) * 0.32, 0.42, 0xc5ced6, 0, 0.21, 0);
      sphere(group, Math.min(sx, sz) * 0.22, 0xefb423, 0, 0.5, 0);
  }
}

const LIKENESSES: Array<[RegExp, string]> = [
  [/\b(cars?|trucks?|bus|buses|vans?|taxi|jeeps?|automobiles?|wagons?)\b/i, "car"],
  [/\b(planes?|airplanes?|jets?|helicopters?|rockets?|spaceships?)\b/i, "plane"],
  [/\b(dragons?|dinosaurs?|monsters?)\b/i, "dragon"],
  [/\b(horses?|ponies|pony)\b/i, "horse"],
  [/\b(cows?|cattle|bulls?|oxen|ox)\b/i, "cow"],
  [/\b(birds?|eagles?|chickens?|ducks?)\b/i, "bird"],
  [/\b(bikes?|bicycles?|motorcycles?|scooters?)\b/i, "bike"],
  [/\btents?\b/i, "tent"],
  [/\b(fish|fishes|sharks?|whales?)\b/i, "fish"],
  [/\b(robots?|androids?)\b/i, "robot"],
  [/\b(barrels?|kegs?)\b/i, "barrel"],
  [/\b(chests?|treasures?)\b/i, "chest"],
  [/\b(statues?|monuments?)\b/i, "statue"],
  [/\bballoons?\b/i, "balloon"],
  [/\bbenches\b|\bbench\b/i, "bench"],
  [/\b(lanterns?|lamps?)\b/i, "lamp"],
];

function modelSpec(entity: Entity): ModelPart[] | null {
  const label = entity.label.trim();
  const known = portrayal(label) !== "custom";
  const catalogTree = entity.sprite === "tree_oak" || entity.sprite === "tree_pine";
  if (known && !catalogTree) return parseModel(inventModel(label));
  if (entity.sprite === "prop" || (entity.sprite === "sign" && label.split(/\s+/).length <= 2 && label.toLowerCase() !== "sign")) {
    return parseModel(modelFor(label, entity.model));
  }
  return null;
}

function drawModel(group: THREE.Group, parts: ModelPart[]) {
  for (const part of parts) {
    if (part.shape === "box") {
      const mesh = box(group, part.a, part.b, part.c, part.color, part.x, part.y, part.z);
      if (part.b <= 0.05 && part.a >= 0.25) mesh.userData.wing = part.z >= 0 ? 1 : -1;
    } else if (part.shape === "sphere") sphere(group, part.a, part.color, part.x, part.y, part.z);
    else if (part.shape === "cone") cone(group, part.a, part.b, part.color, part.x, part.y, part.z);
    else cylinder(group, part.a, part.b, part.color, part.x, part.y, part.z);
  }
}

function likeness(text: string): string | null {
  for (const [pattern, kind] of LIKENESSES) if (pattern.test(text)) return kind;
  return null;
}

function drawLikeness(group: THREE.Group, kind: string, text: string) {
  switch (kind) {
    case "car":
      car(group, text);
      return;
    case "plane":
      plane(group, text);
      return;
    case "dragon":
      dragon(group, text);
      return;
    case "horse":
      horse(group, text);
      return;
    case "cow":
      cow(group, text);
      return;
    case "bird":
      bird(group, text);
      return;
    case "bike":
      bike(group, text);
      return;
    case "tent":
      tent(group, text);
      return;
    case "fish":
      fish(group, text);
      return;
    case "robot":
      robot(group, text);
      return;
    case "barrel":
      barrel(group, text);
      return;
    case "chest":
      chest(group, text);
      return;
    case "statue":
      statue(group, text);
      return;
    case "balloon":
      balloon(group, text);
      return;
    case "bench":
      bench(group, text);
      return;
    case "lamp":
      lamp(group, text);
      return;
    default:
      drawVaried(group, text);
  }
}

function wheel(group: THREE.Group, x: number, y: number, z: number) {
  const mesh = cylinder(group, 0.13, 0.08, 0x2c2c2c, x, y, z);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function car(group: THREE.Group, text: string) {
  const paint = tint(text, 0xc23b3b);
  box(group, 1.2, 0.28, 0.56, paint, 0, 0.28, 0);
  box(group, 0.48, 0.22, 0.48, 0xd7e4ef, -0.08, 0.5, 0);
  box(group, 0.08, 0.08, 0.1, 0xf4f1c8, 0.58, 0.32, 0.16);
  box(group, 0.08, 0.08, 0.1, 0xf4f1c8, 0.58, 0.32, -0.16);
  wheel(group, 0.36, 0.13, 0.28);
  wheel(group, 0.36, 0.13, -0.28);
  wheel(group, -0.36, 0.13, 0.28);
  wheel(group, -0.36, 0.13, -0.28);
}

function plane(group: THREE.Group, text: string) {
  const paint = tint(text, 0xf4f8fc);
  box(group, 1.05, 0.16, 0.2, paint, 0, 0.46, 0);
  box(group, 0.28, 0.04, 1.15, paint, 0.08, 0.46, 0);
  box(group, 0.16, 0.16, 0.36, paint, -0.48, 0.56, 0);
  const nose = cone(group, 0.1, 0.24, 0x66717c, 0.64, 0.46, 0);
  nose.rotation.z = -Math.PI / 2;
}

function dragon(group: THREE.Group, text: string) {
  const color = tint(text, 0x2f8f3a);
  box(group, 0.72, 0.26, 0.32, color, 0, 0.34, 0);
  sphere(group, 0.16, color, 0.46, 0.48, 0);
  cone(group, 0.05, 0.16, color, 0.5, 0.66, 0.07);
  cone(group, 0.05, 0.16, color, 0.5, 0.66, -0.07);
  const snout = cone(group, 0.07, 0.18, 0xe85d4c, 0.64, 0.46, 0);
  snout.rotation.z = -Math.PI / 2;
  box(group, 0.5, 0.04, 0.32, 0x1d5c28, -0.02, 0.52, 0.34);
  box(group, 0.5, 0.04, 0.32, 0x1d5c28, -0.02, 0.52, -0.34);
  box(group, 0.38, 0.08, 0.08, color, -0.52, 0.32, 0);
}

function cow(group: THREE.Group, text: string) {
  const hide = tint(text, 0xf7f4ee);
  box(group, 0.72, 0.28, 0.36, hide, 0, 0.42, 0);
  box(group, 0.16, 0.08, 0.14, 0x2c2c2c, -0.12, 0.58, 0.06);
  box(group, 0.12, 0.08, 0.1, 0x2c2c2c, 0.16, 0.58, -0.08);
  box(group, 0.22, 0.16, 0.18, hide, 0.44, 0.52, 0);
  sphere(group, 0.05, 0xf2b8c6, 0.56, 0.48, 0);
  cone(group, 0.03, 0.12, 0xf6e6c8, 0.4, 0.68, 0.06);
  cone(group, 0.03, 0.12, 0xf6e6c8, 0.4, 0.68, -0.06);
  sphere(group, 0.08, 0xf2b8c6, -0.06, 0.26, 0);
  for (const x of [-0.22, 0.18]) {
    for (const z of [-0.12, 0.12]) box(group, 0.07, 0.28, 0.07, hide, x, 0.14, z);
  }
}

function horse(group: THREE.Group, text: string) {
  const color = tint(text, 0x8d5a32);
  box(group, 0.62, 0.22, 0.24, color, 0, 0.44, 0);
  box(group, 0.12, 0.28, 0.12, color, 0.32, 0.62, 0);
  sphere(group, 0.12, color, 0.4, 0.8, 0);
  box(group, 0.16, 0.05, 0.05, color, -0.38, 0.48, 0);
  for (const x of [-0.18, 0.16]) {
    for (const z of [-0.09, 0.09]) box(group, 0.06, 0.32, 0.06, 0x5c3a22, x, 0.16, z);
  }
}

function bird(group: THREE.Group, text: string) {
  const color = tint(text, 0x3b6fe0);
  sphere(group, 0.14, color, 0, 0.36, 0);
  sphere(group, 0.08, color, 0.16, 0.42, 0);
  box(group, 0.08, 0.03, 0.42, color, 0, 0.4, 0);
  const beak = cone(group, 0.04, 0.12, 0xefb423, 0.28, 0.42, 0);
  beak.rotation.z = -Math.PI / 2;
}

function bike(group: THREE.Group, text: string) {
  const frame = tint(text, 0x2c2c2c);
  wheel(group, -0.28, 0.16, 0);
  wheel(group, 0.28, 0.16, 0);
  box(group, 0.52, 0.04, 0.04, frame, 0, 0.28, 0);
  box(group, 0.04, 0.26, 0.04, frame, -0.14, 0.4, 0);
  box(group, 0.16, 0.04, 0.08, 0x8d5a32, -0.1, 0.36, 0);
}

function tent(group: THREE.Group, text: string) {
  cone(group, 0.42, 0.58, tint(text, 0xe7d7b1), 0, 0.32, 0);
  box(group, 0.1, 0.22, 0.02, 0x5c3a22, 0, 0.14, 0.16);
}

function fish(group: THREE.Group, text: string) {
  const body = sphere(group, 0.18, tint(text, 0x3aa0c8), 0, 0.24, 0);
  body.scale.set(1.7, 0.7, 0.75);
  box(group, 0.16, 0.16, 0.04, 0xd7e4ef, -0.32, 0.24, 0);
}

function robot(group: THREE.Group, text: string) {
  const metal = tint(text, 0xc5ced6);
  box(group, 0.28, 0.32, 0.2, metal, 0, 0.4, 0);
  box(group, 0.22, 0.18, 0.18, 0x66717c, 0, 0.68, 0);
  box(group, 0.06, 0.22, 0.06, metal, -0.08, 0.12, 0);
  box(group, 0.06, 0.22, 0.06, metal, 0.08, 0.12, 0);
  cylinder(group, 0.02, 0.16, 0xefb423, 0, 0.86, 0);
}

function barrel(group: THREE.Group, text: string) {
  cylinder(group, 0.2, 0.36, tint(text, 0x8d5a32), 0, 0.2, 0);
  cylinder(group, 0.22, 0.06, 0x5c3a22, 0, 0.32, 0);
  cylinder(group, 0.22, 0.06, 0x5c3a22, 0, 0.1, 0);
}

function chest(group: THREE.Group, text: string) {
  box(group, 0.46, 0.22, 0.3, tint(text, 0x8d5a32), 0, 0.14, 0);
  box(group, 0.48, 0.06, 0.32, 0xc48945, 0, 0.26, 0);
  box(group, 0.08, 0.08, 0.04, 0xefb423, 0, 0.16, 0.16);
}

function statue(group: THREE.Group, text: string) {
  const stone = tint(text, 0xc5ced6);
  cylinder(group, 0.18, 0.08, 0x8d643c, 0, 0.04, 0);
  person(group, stone, 0.85);
}

function balloon(group: THREE.Group, text: string) {
  sphere(group, 0.26, tint(text, 0xe85d75), 0, 0.7, 0);
  cylinder(group, 0.012, 0.4, 0x5c3a22, 0, 0.32, 0);
}

function bench(group: THREE.Group, text: string) {
  const wood = tint(text, 0xc48945);
  box(group, 0.7, 0.06, 0.28, wood, 0, 0.28, 0);
  box(group, 0.7, 0.2, 0.06, wood, 0, 0.38, -0.12);
  box(group, 0.06, 0.22, 0.06, 0x5c3a22, -0.28, 0.12, 0.08);
  box(group, 0.06, 0.22, 0.06, 0x5c3a22, 0.28, 0.12, 0.08);
}

function lamp(group: THREE.Group, text: string) {
  cylinder(group, 0.04, 0.55, 0x5c3a22, 0, 0.28, 0);
  sphere(group, 0.1, tint(text, 0xf4f1c8), 0, 0.62, 0);
}

function drawVaried(group: THREE.Group, text: string) {
  const color = tint(text, hashColor(text));
  const pick = hash(text.length, text.charCodeAt(0) || 1) % 3;
  if (pick === 0) {
    sphere(group, 0.26, color, 0, 0.3, 0);
    sphere(group, 0.1, 0xf6e6c8, 0.12, 0.48, 0.08);
    return;
  }
  if (pick === 1) {
    cone(group, 0.28, 0.55, color, 0, 0.3, 0);
    sphere(group, 0.08, 0xefb423, 0, 0.64, 0);
    return;
  }
  cylinder(group, 0.2, 0.4, color, 0, 0.24, 0);
  sphere(group, 0.12, 0xf6e6c8, 0, 0.52, 0);
}

function tint(text: string, fallback: number) {
  const paints: Array<[RegExp, number]> = [
    [/\bred\b/i, 0xc23b3b],
    [/\bblue\b/i, 0x3b6fe0],
    [/\bgreen\b/i, 0x2f8f3a],
    [/\byellow\b/i, 0xefb423],
    [/\borange\b/i, 0xe07a3b],
    [/\bpurple\b/i, 0x6b4c9a],
    [/\bblack\b/i, 0x2c2c2c],
    [/\bwhite\b/i, 0xf4f8fc],
    [/\bgold(?:en)?\b/i, 0xd4a017],
    [/\bsilver\b/i, 0xc5ced6],
    [/\bpink\b/i, 0xe85d75],
  ];
  for (const [pattern, color] of paints) if (pattern.test(text)) return color;
  return fallback;
}

function hashColor(text: string) {
  const palette = [0xc23b3b, 0x3b6fe0, 0x2f8f3a, 0xefb423, 0x8c3428, 0x6b4c9a, 0xe07a3b];
  return palette[hash(text.length, text.charCodeAt(0) || 1) % palette.length] ?? 0xc23b3b;
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
