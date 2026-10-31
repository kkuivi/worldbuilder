import { useEffect, useRef } from "react";
import { GRID_H, GRID_W, type Entity, type WorldState } from "@worldbuilder/contracts";
import { createScene, type ScenePulse } from "./scene";

export function MapView({
  world,
  accent,
  selectedId,
  onSelect,
}: {
  world: WorldState;
  accent: string;
  selectedId: string | null;
  onSelect: (entity: Entity | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef(world);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const births = useRef<Record<string, number>>({});
  const pulse = useRef<ScenePulse | null>(null);
  const previous = useRef(world);

  worldRef.current = world;
  selectedRef.current = selectedId;
  onSelectRef.current = onSelect;

  if (previous.current !== world) {
    const now = performance.now();
    const prior = previous.current;
    if (prior.version !== world.version) {
      const tiles: Array<{ x: number; y: number }> = [];
      for (let y = 0; y < GRID_H; y += 1) {
        for (let x = 0; x < GRID_W; x += 1) {
          if (prior.terrain[y]?.[x] !== world.terrain[y]?.[x]) tiles.push({ x, y });
        }
      }
      for (const entity of world.entities) {
        const before = prior.entities.find((item) => item.id === entity.id);
        if (!before) {
          births.current[entity.id] = now;
          for (let y = entity.y; y < entity.y + entity.h; y += 1) {
            for (let x = entity.x; x < entity.x + entity.w; x += 1) tiles.push({ x, y });
          }
        } else if (before.x !== entity.x || before.y !== entity.y || before.sprite !== entity.sprite) {
          births.current[entity.id] = now;
        }
      }
      pulse.current = { tiles, color: accent, at: now };
    }
    previous.current = world;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = createScene(canvas, (id) => {
      const entity = id ? (worldRef.current.entities.find((item) => item.id === id) ?? null) : null;
      onSelectRef.current(entity);
    });
    let frame = 0;
    const loop = () => {
      scene.sync(worldRef.current, selectedRef.current, births.current, pulse.current);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      scene.dispose();
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="map-canvas"
        tabIndex={0}
        role="application"
        aria-label={`${world.name}. Drag to look around, and tap an object to inspect it.`}
      />
      <p className="map-hint">Drag to look around. Pinch or scroll to zoom. Tap something to inspect it.</p>
    </>
  );
}
