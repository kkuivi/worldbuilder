import { useEffect, useRef } from "react";
import { MAP_MAX_H, MAP_MAX_W, mapSize, type Entity, type WorldState } from "@worldbuilder/contracts";
import { createScene, type ScenePulse } from "./scene";

export function MapView({
  world,
  accent,
  selectedId,
  tile,
  insideId,
  onSelect,
  onTile,
  onMove,
  onExpand,
}: {
  world: WorldState;
  accent: string;
  selectedId: string | null;
  tile: { x: number; y: number; w: number; h: number } | null;
  insideId: string | null;
  onSelect: (entity: Entity | null) => void;
  onTile: (tile: { x: number; y: number; w: number; h: number } | null) => void;
  onMove: (id: string, x: number, y: number) => Promise<boolean> | boolean;
  onExpand: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef(world);
  const selectedRef = useRef(selectedId);
  const tileRef = useRef(tile);
  const onSelectRef = useRef(onSelect);
  const onTileRef = useRef(onTile);
  const onMoveRef = useRef(onMove);
  const insideRef = useRef(insideId);
  const births = useRef<Record<string, number>>({});
  const pulse = useRef<ScenePulse | null>(null);
  const previous = useRef(world);

  worldRef.current = world;
  selectedRef.current = selectedId;
  tileRef.current = tile;
  onSelectRef.current = onSelect;
  onTileRef.current = onTile;
  onMoveRef.current = onMove;
  insideRef.current = insideId;

  if (previous.current !== world) {
    const now = performance.now();
    const prior = previous.current;
    if (prior.version !== world.version) {
      const tiles: Array<{ x: number; y: number }> = [];
      const priorSize = mapSize(prior);
      const nextSize = mapSize(world);
      const height = Math.max(priorSize.h, nextSize.h);
      const width = Math.max(priorSize.w, nextSize.w);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
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
        } else if (before.sprite !== entity.sprite) {
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
    const scene = createScene(
      canvas,
      (id) => {
        const entity = id ? (worldRef.current.entities.find((item) => item.id === id) ?? null) : null;
        onSelectRef.current(entity);
      },
      (id, x, y) => onMoveRef.current(id, x, y),
      (next) => onTileRef.current(next),
    );
    let frame = 0;
    const loop = () => {
      scene.sync(worldRef.current, selectedRef.current, births.current, pulse.current, insideRef.current, tileRef.current);
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
        aria-label={`${world.name}. Click a tile or drag across the ground to choose where to build. Drag an object to move it. Right-drag to look around.`}
      />
      {!insideId ? (
        <button
          className="expand-map"
          type="button"
          disabled={mapSize(world).w >= MAP_MAX_W && mapSize(world).h >= MAP_MAX_H}
          onClick={onExpand}
        >
          Expand map
        </button>
      ) : null}
      <p className="map-hint">
        {tile && tile.w * tile.h > 1
          ? "This area is selected. Ask the chat to build inside it."
          : tile
            ? "This tile is selected. Drag to grow it into an area."
            : insideId
              ? "Click a floor tile, or drag across the floor to choose an area."
              : "Click a tile, or drag across the ground to mark where to build."}
      </p>
    </>
  );
}
