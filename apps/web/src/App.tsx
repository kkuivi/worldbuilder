import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { PLAYER_COLORS, canEnter, type Entity, type Player, type WorldState } from "@worldbuilder/contracts";
import { MapView } from "./MapView";
import { useWorld } from "./useWorld";

const STORAGE_KEY = "swb-player";

interface SavedPlayer {
  id: string;
  name: string;
  color: string;
}

function loadPlayer(): SavedPlayer | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "") as SavedPlayer;
    if (!parsed.id || !parsed.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePlayer(player: SavedPlayer): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(player));
}

function shownKind(entity: Entity): string {
  const label = entity.label.trim();
  const made =
    entity.sprite === "prop" ||
    Boolean(entity.model) ||
    (entity.sprite === "sign" && label.toLowerCase() !== "sign" && label.split(/\s+/).length <= 2);
  return made ? "model" : entity.sprite.replaceAll("_", " ");
}

function roomFromUrl(): string {
  return new URLSearchParams(location.search).get("room")?.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) ?? "";
}

export function App() {
  const stored = useMemo(loadPlayer, []);
  const [session, setSession] = useState<{ roomId: string; player: Player } | null>(() => {
    const roomId = roomFromUrl();
    if (!stored || !roomId) return null;
    return { roomId, player: { ...stored, joinedAt: new Date().toISOString() } };
  });

  function enter(roomId: string, player: SavedPlayer) {
    savePlayer(player);
    const next = { roomId, player: { ...player, joinedAt: new Date().toISOString() } };
    history.pushState({}, "", `/?room=${roomId}`);
    setSession(next);
  }

  function leave() {
    history.pushState({}, "", "/");
    setSession(null);
  }

  if (!session) return <Gate initialCode={roomFromUrl()} stored={stored} onEnter={enter} />;
  return <WorldScreen roomId={session.roomId} player={session.player} onLeave={leave} />;
}

function Gate({
  initialCode,
  stored,
  onEnter,
}: {
  initialCode: string;
  stored: SavedPlayer | null;
  onEnter: (roomId: string, player: SavedPlayer) => void;
}) {
  const [name, setName] = useState(stored?.name ?? "");
  const [color, setColor] = useState(stored?.color ?? PLAYER_COLORS[0]);
  const [worldName, setWorldName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [worlds, setWorlds] = useState<Array<{ id: string; name: string; playerCount: number }>>([]);

  useEffect(() => {
    void fetch("/api/worlds")
      .then((response) => response.json())
      .then((body: { worlds?: Array<{ id: string; name: string; playerCount: number }> }) => setWorlds(body.worlds ?? []))
      .catch(() => setWorlds([]));
  }, []);

  function profile(): SavedPlayer {
    return {
      id: stored?.id ?? crypto.randomUUID(),
      name: name.trim(),
      color,
    };
  }

  async function createWorld() {
    if (!name.trim()) {
      setError("Pick a name so the builder can credit you.");
      return;
    }
    setPending(true);
    setError("");
    const player = profile();
    try {
      const response = await fetch("/api/worlds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: worldName, player }),
      });
      const body = (await response.json()) as { roomId?: string; error?: string };
      if (!response.ok || !body.roomId) throw new Error(body.error ?? "Could not create a world.");
      onEnter(body.roomId, player);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create a world.");
      setPending(false);
    }
  }

  function join(roomId = code) {
    const clean = roomId.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    if (!name.trim()) {
      setError("Pick a name so the builder can credit you.");
      return;
    }
    if (clean.length !== 4) {
      setError("Room codes are four letters.");
      return;
    }
    onEnter(clean, profile());
  }

  return (
    <main className="landing">
      <header className="landing-bar">
        <a className="brand" href="#start">
          <span className="mark" />
          <strong>Hearsay</strong>
        </a>
        <a className="secondary" href="#start">
          Start a world
        </a>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">One map, every voice</p>
          <h1>Build a world with your friends, out loud.</h1>
          <p className="lede">
            Ask for a ranch, a night sky, or a blue couch. A builder listens to the chat and changes the same 3D map on every screen.
          </p>
          <ul className="hero-points">
            <li>Everyone in the room sees the same edits.</li>
            <li>Houses, towers, and castles open into rooms you furnish together.</li>
            <li>Click a tile, or drag out an area, and the next thing you ask for is built there.</li>
          </ul>
        </div>
      </section>
      <section className="film" aria-label="A world being built">
        <video src="/outside.mp4" autoPlay muted loop playsInline />
        <p>Drag out a neighborhood, lay a road through it, add cows and a campfire, then ask for night.</p>
      </section>
      <section className="start" id="start">
        <div>
          <p className="eyebrow">Open a room</p>
          <h2>Pick a name, then make a world or walk into one.</h2>
          <p className="lede">A room code is four letters. Share it and your friend joins the same map.</p>
        </div>
        <section className="gate-card">
          <label>
            Your name
            <input value={name} maxLength={24} autoFocus onChange={(event) => setName(event.target.value)} placeholder="Ada" />
          </label>
          <div className="colors" role="radiogroup" aria-label="Your color">
            {PLAYER_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={swatch === color ? "swatch selected" : "swatch"}
                style={{ background: swatch }}
                aria-label={swatch}
                aria-checked={swatch === color}
                role="radio"
                onClick={() => setColor(swatch)}
              />
            ))}
          </div>
          <label>
            World name
            <input value={worldName} maxLength={40} onChange={(event) => setWorldName(event.target.value)} placeholder="Untitled wilds" />
          </label>
          <button className="primary" type="button" disabled={pending} onClick={() => void createWorld()}>
            {pending ? "Opening…" : "Create world"}
          </button>
          <div className="join-row">
            <label>
              Room code
              <input
                value={code}
                maxLength={4}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="K7QD"
                onKeyDown={(event) => {
                  if (event.key === "Enter") join();
                }}
              />
            </label>
            <button className="secondary" type="button" onClick={() => join()}>
              Join
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          {worlds.length ? (
            <div className="recent">
              <h2>Recent worlds</h2>
              <ul>
                {worlds.map((world) => (
                  <li key={world.id}>
                    <button type="button" onClick={() => join(world.id)}>
                      <span>{world.name}</span>
                      <span className="code">{world.id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </section>
      <section className="showcase">
        <p className="eyebrow">What you can do</p>
        <h2>The chat is the building tool.</h2>
        <ul className="cards">
          <li>
            <h3>Ask for the place</h3>
            <p>Say “add a ranch with cows,” “make a river,” or “it should be night.” The builder paints the ground and places what you named.</p>
          </li>
          <li>
            <h3>Step inside</h3>
            <p>Tap a house, tower, or castle and choose Go inside. Ask for a couch, a lamp, or a rug. Friends in that room see the same furniture.</p>
          </li>
          <li>
            <h3>Move it by hand</h3>
            <p>Drag any object to another tile. Drag across empty ground to mark a line or a block. Right-drag to look around.</p>
          </li>
          <li>
            <h3>Change what you selected</h3>
            <p>Tap something first. The chat then says Editing. “Make it blue,” “turn it into a lamp,” or “remove it” changes that piece, not a new one.</p>
          </li>
          <li>
            <h3>One room, many people</h3>
            <p>Share the code or the link. Each person picks a color, shows up on the map, and the next sentence from anyone can change the world.</p>
          </li>
        </ul>
      </section>
      <section className="howto">
        <p className="eyebrow">How to use it</p>
        <h2>From an empty field to a furnished room.</h2>
        <ol>
          <li>
            <strong>Name yourself.</strong>
            <span>Choose a color so friends can tell your messages apart.</span>
          </li>
          <li>
            <strong>Create or join.</strong>
            <span>A new world gets a four-letter code. Someone with the code opens the same map.</span>
          </li>
          <li>
            <strong>Talk to the builder.</strong>
            <span>Type in the chat. “Add a road in front of the tower” is enough. Wait for the map to change.</span>
          </li>
          <li>
            <strong>Point at a tile.</strong>
            <span>Click one tile, or drag from one corner to another. A road follows the line. A neighborhood stays inside the block.</span>
          </li>
          <li>
            <strong>Go indoors.</strong>
            <span>Tap the building, then Go inside. The suggestions switch to a couch, a table, and a rug.</span>
          </li>
          <li>
            <strong>Rearrange.</strong>
            <span>Drag furniture across the floor. Back outside returns you to the city, and the room keeps what you placed.</span>
          </li>
          <li>
            <strong>Edit a single piece.</strong>
            <span>Select it so the box says Editing, then describe the change. Adding something new still works when you say “add.”</span>
          </li>
        </ol>
      </section>
    </main>
  );
}

function WorldScreen({ roomId, player, onLeave }: { roomId: string; player: Player; onLeave: () => void }) {
  const { world, status, log, connection, error, accent, busy, say, locate, move } = useWorld(roomId, player);
  const [draft, setDraft] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tile, setTile] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [insideId, setInsideId] = useState<string | null>(null);
  const selected = world?.entities.find((entity) => entity.id === selectedId) ?? null;
  const inside = world?.entities.find((entity) => entity.id === insideId && canEnter(entity)) ?? null;
  const [sendError, setSendError] = useState("");
  const company = (world?.players ?? []).filter((item) => item.inside === insideId && item.id !== player.id);

  useEffect(() => {
    locate(inside?.id ?? null);
  }, [inside?.id, locate]);

  async function send(text = draft) {
    if (!text.trim()) return;
    setSendError("");
    try {
      await say(text, inside?.id, selected?.id, selected ? null : tile);
      setDraft("");
    } catch (reason) {
      setSendError(reason instanceof Error ? reason.message : "The message did not send.");
    }
  }

  function enterBuilding(entity: Entity) {
    setInsideId(entity.id);
    setSelectedId(null);
    setTile(null);
  }

  return (
    <main className="world">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden />
          <div>
            <p className="eyebrow">Hearsay</p>
            <h1>{world?.name ?? "Opening the map"}</h1>
          </div>
        </div>
        <div className="presence">
          {(world?.players ?? []).map((item) => (
            <span key={item.id} className="chip" style={{ borderColor: item.color }}>
              <i style={{ background: item.color }} />
              {item.name}
            </span>
          ))}
          <span className={busy ? "chip builder busy" : "chip builder"}>
            <i />
            Builder
          </span>
        </div>
        <div className="top-actions">
          <strong className="room-code">{roomId}</strong>
          <ShareButton roomId={roomId} />
          <button className="ghost" type="button" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>
      <section className="stage">
        <div className="map-pane">
          {world ? (
            <>
              <MapView
                world={world}
                accent={accent}
                selectedId={selectedId}
                tile={tile}
                insideId={inside?.id ?? null}
                onSelect={(entity) => {
                  setSelectedId(entity?.id ?? null);
                  if (entity) setTile(null);
                }}
                onTile={(next) => {
                  if (next) setSelectedId(null);
                  setTile((current) => {
                    if (!next) return null;
                    const same = current && current.x === next.x && current.y === next.y && current.w === next.w && current.h === next.h;
                    if (same && next.w === 1 && next.h === 1) return null;
                    return next;
                  });
                }}
                onMove={move}
              />
              {inside ? (
                <div className="room-bar">
                  <strong>Inside {inside.label}</strong>
                  <span>{company.length ? `${company.map((item) => item.name).join(", ")} here too` : "Invite a friend in"}</span>
                  <button type="button" onClick={() => { setInsideId(null); setTile(null); setSelectedId(null); }}>
                    Back outside
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <p className="waiting">Raising the ground…</p>
          )}
          {tile && !selected ? (
            <article className="inspector">
              <header>
                <strong>{tile.w === 1 || tile.h === 1 ? (tile.w * tile.h > 1 ? "This path" : "This tile") : "This area"}</strong>
                <button type="button" onClick={() => setTile(null)} aria-label="Close details">
                  Close
                </button>
              </header>
              <p>
                {tile.w * tile.h > 1
                  ? "Ask in the chat and the builder keeps it inside this area."
                  : "Ask in the chat and the builder puts it here."}
              </p>
            </article>
          ) : null}
          {selected && world ? (
            <article className="inspector">
              <header>
                <strong>{selected.label}</strong>
                <button type="button" onClick={() => setSelectedId(null)} aria-label="Close details">
                  Close
                </button>
              </header>
              <p>{selected.note ?? "No story yet."}</p>
              <p className="meta">
                {shownKind(selected)} · {creatorName(world, selected.createdBy)} · drag it to move
              </p>
              {canEnter(selected) ? (
                <button className="enter" type="button" onClick={() => enterBuilding(selected)}>
                  Go inside
                </button>
              ) : null}
            </article>
          ) : null}
        </div>
        <aside className="chat">
          <div className={busy ? "builder-line busy" : "builder-line"}>
            <span className="pulse" />
            <p>{status}</p>
            <small>{connection === "live" ? "Live" : connection === "polling" ? "Polling" : "Connecting"}</small>
          </div>
          <ol className="messages">
            {(world?.chat ?? []).map((message) => {
              const speaker = message.role === "agent" ? null : world?.players.find((item) => item.id === message.from);
              return (
                <li key={message.id} className={message.role === "agent" ? "message agent" : "message"} style={{ borderColor: speaker?.color ?? "#1e3a2f" }}>
                  <strong style={{ color: speaker?.color }}>{speaker?.name ?? message.from}</strong>
                  <p>{message.text}</p>
                </li>
              );
            })}
          </ol>
          <details className="behind">
            <summary>Behind the scenes</summary>
            <ol>
              {log.length ? (
                log.map((line) => (
                  <li key={line.id}>
                    <strong>{line.from}</strong> {line.text}
                  </li>
                ))
              ) : (
                <li>The team talks here once a request comes in.</li>
              )}
            </ol>
          </details>
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <div className="suggestions">
              {(selected
              ? ["Make it blue", "Turn it into a lamp", "Remove it"]
              : tile
                ? inside
                  ? ["Add a couch", "Add a lamp", "Add a rug"]
                  : tile.w === 1 || tile.h === 1
                    ? tile.w * tile.h > 1
                      ? ["Add a road", "Add a path", "Add trees"]
                      : ["Add a tree", "Add a house", "Add a campfire"]
                    : ["Add a neighborhood", "Add trees", "Add a road"]
                : inside
                  ? ["Add a couch", "Add a table", "Add a rug"]
                  : ["Add a village", "Make a river", "It should be winter"]
            ).map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => void send(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
            {selected ? <p className="editing">Editing {selected.label}</p> : tile ? <p className="editing">{tile.w * tile.h > 1 ? "Building in this area" : "Building on this tile"}</p> : null}
            <div className="compose-row">
              <input
                value={draft}
                maxLength={400}
                placeholder={selected ? `Change the ${selected.label}…` : tile && tile.w * tile.h > 1 ? "Ask for a road, a neighborhood, trees…" : tile ? "Ask for what should stand here…" : "Ask for a castle, a shore, a knight…"}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button className="primary" type="submit">
                Send
              </button>
            </div>
            {sendError || error ? <p className="form-error">{sendError || error}</p> : null}
          </form>
        </aside>
      </section>
    </main>
  );
}

function creatorName(world: WorldState, createdBy: string): string {
  if (createdBy === "agent") return "placed by the builder";
  return world.players.find((player) => player.id === createdBy)?.name ?? createdBy;
}

function ShareButton({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState(`${location.origin}/?room=${roomId}`);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
    void fetch("/api/lan")
      .then((response) => response.json())
      .then((body: { origin?: string | null }) => {
        if (body.origin) setUrl(`${body.origin}/?room=${roomId}`);
      })
      .catch(() => undefined);
  }, [roomId]);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, url, { width: 168, margin: 1, color: { dark: "#1c2430", light: "#fffdf8" } });
  }, [open, url]);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="share">
      <button className="secondary" type="button" onClick={() => setOpen((value) => !value)}>
        Share
      </button>
      {open ? (
        <div className="share-pop" role="dialog" aria-label="Share this world">
          <canvas ref={canvasRef} width={168} height={168} />
          <p>{url.replace(/^https?:\/\//, "")}</p>
          <button className="primary" type="button" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
