# Shared World

Several people share one map. Each person talks to the builder in chat, and the same 3D world updates on every screen.

A room is a 24 by 16 grid. Terrain has height: water sits lowest, then sand, dirt, grass, snow, and stone. Players can place houses, trees, castles, rivers, roads, and the rest of the sprite catalog by asking in plain language.

A live copy is at https://worldbuilder-4vna.onrender.com.

## Run it

You need [Bun](https://bun.sh).

```bash
bun install
cp .env.example .env
bun run dev
```

Open http://localhost:5174. Create a world, then share the four-letter room code. Other browsers on the same machine can join with that code. The share dialog rewrites the link to your LAN address when you are on localhost, so phones on the same network can join too.

| Script | What it does |
| --- | --- |
| `bun run dev` | API on port 8791 and the Vite app on port 5174 |
| `bun run build` | Builds the web app into `apps/web/dist` |
| `bun run start` | Serves the built app and the API from one process |
| `bun run smoke` | Runs the room engine tests |
| `bun run typecheck` | Typechecks the web app, engine, and orchestrator |

`LLM_API_KEY` is optional. Without it, a local planner still paints terrain and places sprites from keywords in the chat. With a key, the builder asks a model to fulfill every request, then repairs any edits the placement rules reject.

## How a turn works

1. A player joins a room and sends a message over the websocket.
2. The orchestrator waits about 2.5 seconds so nearby messages form one batch.
3. The builder turns that batch into edit operations: paint, place, move, remove, or update.
4. The engine applies the operations. Houses, towers, castles, and trees cannot sit on water. Bridges and boats need water. Roads cannot cross water. Entities cannot overlap.
5. Every connected client receives the new terrain, entities, and chat.

Rooms live in memory and are written to `.data/rooms.json`. Restarting the process restores them from that file.

## Layout

```
apps/web           React and Three.js client
apps/orchestrator  HTTP API, websockets, builder, and disk persistence
apps/actor         Durable room actor for Terse
packages/contracts Shared world types, sprites, and schemas
packages/engine    Room state, placement rules, and the local planner
supabase/schema.sql Optional world index and snapshots
```

The web app talks to `/api` and `/ws`. In development, Vite proxies those to the orchestrator. After `bun run build`, `bun run start` serves `apps/web/dist` itself.

## Configuration

Copy `.env.example` to `.env`. Empty values are fine for a local game.

| Variable | Purpose |
| --- | --- |
| `LLM_API_KEY` | Model key. Empty uses the local planner. |
| `LLM_BASE_URL` | OpenAI-compatible chat completions URL |
| `LLM_MODEL_FAST` | Model name for the builder |
| `PORT` | Orchestrator port. Defaults to `8791`. |
| `WEB_PORT` | Vite port, used when building LAN share links. Defaults to `5174`. |
| `DATA_FILE` | Room snapshot path. Defaults to `.data/rooms.json`. |
| `SUPABASE_URL` | Optional. Recent worlds and version snapshots. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service key for those writes. |
| `RELAY_API_KEY` | Optional. Mirrors builder status lines to a relay workspace. `RELAY_WORKSPACE` works as the same key. |

`apps/actor` is a durable room for [Terse](https://terse.dev). Deploy `src/actor.ts` with `terse deploy` when `TERSE_API_KEY` is set. Local play uses the orchestrator and does not require Terse.

To store a world index outside this machine, run `supabase/schema.sql` and set the two Supabase variables. The live map still comes from the process that owns the room.

## Container

```bash
docker build -t worldbuilder .
docker run --rm -p 8080:8080 -e LLM_API_KEY=sk-... worldbuilder
```

The image builds the web app and serves it with the orchestrator on port 8080.
