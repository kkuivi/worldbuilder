declare module "three" {
  export class Vector2 {
    x: number;
    y: number;
    constructor(x?: number, y?: number);
  }

  export class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
    set(x: number, y: number, z: number): this;
    setScalar(value: number): this;
  }

  export class Euler {
    x: number;
    y: number;
    z: number;
  }

  export class Color {
    constructor(color?: number | string);
    set(color: number | string): this;
  }

  export class Clock {
    getElapsedTime(): number;
  }

  export interface UserData {
    id?: string;
    water?: boolean;
    baseY?: number;
    until?: number;
    flame?: boolean;
    fly?: boolean;
    homeX?: number;
    homeY?: number;
    homeZ?: number;
    phase?: number;
    wing?: number;
    cellX?: number;
    cellY?: number;
  }

  export class Object3D {
    id: number;
    position: Vector3;
    rotation: Euler;
    scale: Vector3;
    userData: UserData;
    parent: Object3D | null;
    children: Object3D[];
    visible: boolean;
    renderOrder: number;
    add(...objects: Object3D[]): this;
    remove(...objects: Object3D[]): this;
    traverse(callback: (node: Object3D) => void): void;
    clear(): this;
  }

  export class Group extends Object3D {}
  export class Scene extends Object3D {}
  export class Camera extends Object3D {}

  export class PerspectiveCamera extends Camera {
    fov: number;
    aspect: number;
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    updateProjectionMatrix(): void;
  }

  export class Light extends Object3D {
    color: Color;
    intensity: number;
  }
  export class AmbientLight extends Light {
    constructor(color?: number, intensity?: number);
  }
  export class HemisphereLight extends Light {
    groundColor: Color;
    constructor(skyColor?: number, groundColor?: number, intensity?: number);
  }
  export class DirectionalLight extends Light {
    constructor(color?: number, intensity?: number);
  }

  export class BufferGeometry {
    dispose(): void;
  }
  export class BoxGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, depth?: number);
  }
  export class RingGeometry extends BufferGeometry {
    constructor(innerRadius?: number, outerRadius?: number, thetaSegments?: number);
  }
  export class DodecahedronGeometry extends BufferGeometry {
    constructor(radius?: number);
  }
  export class TorusGeometry extends BufferGeometry {
    constructor(radius?: number, tube?: number, radialSegments?: number, tubularSegments?: number);
  }
  export class CylinderGeometry extends BufferGeometry {
    constructor(radiusTop?: number, radiusBottom?: number, height?: number, radialSegments?: number);
  }
  export class ConeGeometry extends BufferGeometry {
    constructor(radius?: number, height?: number, radialSegments?: number);
  }
  export class SphereGeometry extends BufferGeometry {
    constructor(radius?: number, widthSegments?: number, heightSegments?: number);
  }

  export const DoubleSide: number;

  export class Material {
    dispose(): void;
  }
  export class MeshLambertMaterial extends Material {
    emissive: { setHex(hex: number): void };
    constructor(parameters?: { color?: number });
  }
  export class MeshBasicMaterial extends Material {
    opacity: number;
    constructor(parameters?: {
      color?: number | Color;
      transparent?: boolean;
      opacity?: number;
      side?: number;
      depthWrite?: boolean;
    });
  }

  export class Mesh extends Object3D {
    geometry: BufferGeometry;
    material: Material | Material[];
    constructor(geometry?: BufferGeometry, material?: Material | Material[]);
  }

  export class Raycaster {
    setFromCamera(pointer: Vector2, camera: Camera): void;
    intersectObjects(objects: Object3D[], recursive?: boolean): Array<{ object: Object3D }>;
  }

  export class WebGLRenderer {
    constructor(parameters?: { canvas?: HTMLCanvasElement; antialias?: boolean });
    setPixelRatio(value: number): void;
    setClearColor(color: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    render(scene: Scene, camera: Camera): void;
    dispose(): void;
  }
}

declare module "three/addons/controls/OrbitControls.js" {
  import { Camera, Vector3 } from "three";
  export class OrbitControls {
    target: Vector3;
    enableDamping: boolean;
    screenSpacePanning: boolean;
    maxPolarAngle: number;
    minDistance: number;
    maxDistance: number;
    enabled: boolean;
    mouseButtons: { LEFT: number; MIDDLE: number; RIGHT: number };
    constructor(camera: Camera, domElement?: HTMLElement);
    addEventListener(type: string, listener: () => void): void;
    update(): void;
    dispose(): void;
  }
}
