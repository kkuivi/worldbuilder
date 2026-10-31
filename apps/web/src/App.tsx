import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { PLAYER_COLORS, type Player, type WorldState } from "@worldbuilder/contracts";
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
    <main className="gate">
      <section className="gate-card">
        <p className="eyebrow">One map, every voice</p>
        <h1>Shared World</h1>
        <p className="lede">Talk to the builder together. The same world changes on every screen.</p>
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
    </main>
  );
}

function WorldScreen({ roomId, player, onLeave }: { roomId: string; player: Player; onLeave: () => void }) {
  const { world, status, log, connection, error, accent, busy, say } = useWorld(roomId, player);
  const [draft, setDraft] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = world?.entities.find((entity) => entity.id === selectedId) ?? null;
  const [sendError, setSendError] = useState("");

  async function send(text = draft) {
    if (!text.trim()) return;
    setSendError("");
    try {
      await say(text);
      setDraft("");
    } catch (reason) {
      setSendError(reason instanceof Error ? reason.message : "The message did not send.");
    }
  }

  return (
    <main className="world">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden />
          <div>
            <p className="eyebrow">Shared World</p>
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
            <MapView
              world={world}
              accent={accent}
              selectedId={selectedId}
              onSelect={(entity) => setSelectedId(entity?.id ?? null)}
            />
          ) : (
            <p className="waiting">Raising the ground…</p>
          )}
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
                {selected.sprite.replaceAll("_", " ")} · {creatorName(world, selected.createdBy)}
              </p>
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
              {["Add a village", "Make a river", "It should be winter"].map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => void send(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
            <div className="compose-row">
              <input
                value={draft}
                maxLength={400}
                placeholder="Ask for a castle, a shore, a knight…"
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
