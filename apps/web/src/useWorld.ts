import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, EditsPayload, Player, WorldEvent, WorldState } from "@worldbuilder/contracts";

export interface StatusNote {
  id: string;
  from: string;
  text: string;
}

interface SocketGrant {
  websocketUrl: string;
  local?: boolean;
}

function appendChat(chat: ChatMessage[], message: ChatMessage): ChatMessage[] {
  if (chat.some((item) => item.id === message.id)) return chat;
  return [...chat, message].slice(-100);
}

function upsertPlayer(players: Player[], player: Player): Player[] {
  const index = players.findIndex((item) => item.id === player.id);
  if (index < 0) return [...players, player];
  const next = [...players];
  next[index] = player;
  return next;
}

export function useWorld(roomId: string, player: Player) {
  const [world, setWorld] = useState<WorldState | null>(null);
  const [status, setStatus] = useState("Waiting for the map.");
  const [log, setLog] = useState<StatusNote[]>([]);
  const [connection, setConnection] = useState<"connecting" | "live" | "polling">("connecting");
  const [error, setError] = useState("");
  const [accent, setAccent] = useState(player.color);
  const [busy, setBusy] = useState(false);
  const worldRef = useRef<WorldState | null>(null);
  const seen = useRef(new Set<number>());
  const seq = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const mode = useRef<"connecting" | "live" | "polling">("connecting");
  const moveWait = useRef(new Map<string, (ok: boolean) => void>());

  const commit = useCallback((next: WorldState) => {
    worldRef.current = next;
    setWorld(next);
  }, []);

  const applyEvent = useCallback(
    (event: WorldEvent) => {
      if (seen.current.has(event.seq)) return;
      seen.current.add(event.seq);
      seq.current = Math.max(seq.current, event.seq);
      if (event.kind === "agent_status") {
        const payload = event.payload as { text?: string; from?: string };
        const text = payload.text ?? "Working.";
        const from = payload.from ?? "Builder";
        setStatus(`${from} · ${text}`);
        setBusy(true);
        setLog((current) => [...current, { id: String(event.seq), from, text }].slice(-40));
        return;
      }
      const current = worldRef.current;
      if (!current) return;
      if (event.kind === "player_joined") {
        const payload = event.payload as { player: Player };
        commit({ ...current, players: upsertPlayer(current.players, payload.player) });
        return;
      }
      if (event.kind === "chat") {
        const payload = event.payload as { message: ChatMessage };
        commit({ ...current, chat: appendChat(current.chat, payload.message) });
        return;
      }
      if (event.kind === "edits") {
        const payload = event.payload as EditsPayload;
        if (payload.colors[0]) setAccent(payload.colors[0]);
        commit({
          ...current,
          version: payload.version,
          sky: payload.sky ?? current.sky,
          terrain: payload.terrain,
          entities: payload.entities,
          chat: payload.message.text ? appendChat(current.chat, payload.message) : current.chat,
        });
        setStatus("Director · The map changed.");
        setBusy(false);
      }
    },
    [commit],
  );

  const takeSnapshot = useCallback(
    (snapshot: WorldState, events: WorldEvent[]) => {
      commit(snapshot);
      const notes: StatusNote[] = [];
      for (const event of events) {
        seen.current.add(event.seq);
        seq.current = Math.max(seq.current, event.seq);
        if (event.kind === "agent_status") {
          const payload = event.payload as { text?: string; from?: string };
          notes.push({ id: String(event.seq), from: payload.from ?? "Builder", text: payload.text ?? "" });
        }
      }
      if (notes.length) setLog(notes.slice(-40));
      setStatus("The builder is listening.");
    },
    [commit],
  );

  const say = useCallback(
    async (text: string, inside?: string | null, focus?: string | null, spot?: { x: number; y: number; w?: number; h?: number } | null) => {
      const clean = text.trim();
      if (!clean) return;
      const socket = socketRef.current;
      const room = inside || undefined;
      const selected = focus || undefined;
      const pin = spot && Number.isInteger(spot.x) && Number.isInteger(spot.y)
        ? { x: spot.x, y: spot.y, w: spot.w && spot.w > 0 ? spot.w : 1, h: spot.h && spot.h > 0 ? spot.h : 1 }
        : undefined;
      if (socket && socket.readyState === WebSocket.OPEN && mode.current === "live") {
        socket.send(JSON.stringify({ type: "say", playerId: player.id, text: clean, inside: room, focus: selected, spot: pin }));
        return;
      }
      const response = await fetch(`/api/worlds/${roomId}/say`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: player.id, text: clean, inside: room, focus: selected, spot: pin }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "The message did not send.");
      }
    },
    [player.id, roomId],
  );

  const locate = useCallback(
    (inside: string | null) => {
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN && mode.current === "live") {
        socket.send(JSON.stringify({ type: "inside", playerId: player.id, inside }));
      }
    },
    [player.id],
  );

  const move = useCallback(
    async (id: string, x: number, y: number) => {
      const token = `${Date.now()}-${id}`;
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN && mode.current === "live") {
        const result = new Promise<boolean>((resolve) => {
          moveWait.current.set(token, resolve);
          window.setTimeout(() => {
            if (!moveWait.current.has(token)) return;
            moveWait.current.delete(token);
            resolve(false);
          }, 4000);
        });
        socket.send(JSON.stringify({ type: "move", token, playerId: player.id, id, x, y }));
        return result;
      }
      const response = await fetch(`/api/worlds/${roomId}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: player.id, id, x, y }),
      });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; reason?: string; world?: WorldState };
      if (body.world) commit(body.world);
      if (!body.ok && body.reason) setError(body.reason);
      else setError("");
      return Boolean(body.ok);
    },
    [commit, player.id, roomId],
  );

  useEffect(() => {
    let stopped = false;
    let pollTimer = 0;
    let fallbackTimer = 0;
    const socketHolder: { current: WebSocket | null } = { current: null };

    async function poll() {
      const response = await fetch(`/api/worlds/${roomId}/state?since=${seq.current}`);
      if (!response.ok) throw new Error("The world is not reachable.");
      const body = (await response.json()) as { world: WorldState; events: WorldEvent[] };
      if (stopped) return;
      if (!worldRef.current || worldRef.current.version !== body.world.version) commit(body.world);
      for (const event of body.events) applyEvent(event);
      if (worldRef.current && body.world.version !== worldRef.current.version) commit(body.world);
    }

    function startPoll() {
      if (stopped || mode.current === "polling") return;
      mode.current = "polling";
      setConnection("polling");
      setStatus("Live socket unavailable. Checking the map every moment.");
      const tick = () => {
        void poll().catch((error: unknown) => setError(error instanceof Error ? error.message : "Polling failed."));
        pollTimer = window.setTimeout(tick, 1500);
      };
      tick();
    }

    async function connect() {
      setError("");
      const joined = await fetch(`/api/worlds/${roomId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ player }),
      });
      if (!joined.ok) {
        const body = (await joined.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "That room code does not exist.");
      }
      const payload = (await joined.json()) as { world: WorldState; events: WorldEvent[] };
      if (stopped) return;
      takeSnapshot(payload.world, payload.events);
      await fetch(`/api/worlds/${roomId}/watch`, { method: "POST" });

      const grantResponse = await fetch(`/api/worlds/${roomId}/socket`, { method: "POST" });
      const grant = (await grantResponse.json()) as SocketGrant;
      const url = grant.local ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/${roomId}` : grant.websocketUrl;
      const socket = new WebSocket(url);
      socketHolder.current = socket;
      socketRef.current = socket;
      fallbackTimer = window.setTimeout(() => {
        socket.close();
        startPoll();
      }, 3000);
      socket.onopen = () => {
        if (stopped) return;
        window.clearTimeout(fallbackTimer);
        mode.current = "live";
        setConnection("live");
        socket.send(JSON.stringify({ type: "subscribe", since: seq.current }));
        socket.send(JSON.stringify({ type: "join", player }));
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as {
          type?: string;
          world?: WorldState;
          events?: WorldEvent[];
          event?: WorldEvent;
          error?: string;
          token?: string;
          ok?: boolean;
          reason?: string;
        };
        if (message.type === "state" && message.world) takeSnapshot(message.world, message.events ?? []);
        if (message.type === "event" && message.event) applyEvent(message.event);
        if (message.type === "move_result" && message.token) {
          const finish = moveWait.current.get(message.token);
          if (!message.ok && message.reason) setError(message.reason);
          else setError("");
          finish?.(Boolean(message.ok));
          moveWait.current.delete(message.token);
        }
        if (message.type === "error" && message.error) setError(message.error);
      };
      socket.onerror = () => {
        if (mode.current !== "live") startPoll();
      };
      socket.onclose = () => {
        if (!stopped && mode.current === "live") startPoll();
      };
    }

    void connect().catch((error: unknown) => {
      if (stopped) return;
      setError(error instanceof Error ? error.message : "Could not join.");
      startPoll();
    });

    return () => {
      stopped = true;
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(pollTimer);
      socketHolder.current?.close();
    };
  }, [applyEvent, commit, player, roomId, takeSnapshot]);

  return { world, status, log, connection, error, accent, busy, say, locate, move };
}
