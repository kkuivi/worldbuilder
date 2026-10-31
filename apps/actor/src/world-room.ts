import { Actor, Persisted, type ActorSocket } from "terse-sdk/actor";
import type { EditBatch, Player, WorldEvent } from "@worldbuilder/contracts";
import { WorldRoom as RoomLogic, type RoomDump } from "@worldbuilder/engine";

type Metadata = { playerId?: string };
type Incoming =
  | { type: "join"; player: Player }
  | { type: "say"; playerId: string; text: string }
  | { type: "subscribe"; since?: number };
type Outgoing = { type: "state"; dump: RoomDump } | { type: "event"; event: WorldEvent };
type Socket = ActorSocket<Metadata, Outgoing>;

/**
 * One durable actor per room code. The orchestrator is the local host used
 * for development. Deploy this class with `terse deploy` when TERSE_API_KEY
 * is set, then point TERSE_ACTOR_URL at the hosted actor.
 *
 * Persisted state is one JSON string, reassigned on every write. Nested
 * mutations are not saved by the runtime.
 */
export class WorldRoom extends Actor<Metadata, Incoming, Outgoing> {
  @Persisted
  private snapshot = "";

  private logic(): RoomLogic {
    const room = new RoomLogic(String(this.id));
    if (this.snapshot) room.load(JSON.parse(this.snapshot) as RoomDump);
    return room;
  }

  private save(room: RoomLogic): void {
    const dump = room.dump();
    this.snapshot = JSON.stringify(dump);
  }

  private publish(socket: Socket | null, room: RoomLogic, afterSeq: number): void {
    for (const event of room.eventsSince(afterSeq)) {
      const message = { type: "event" as const, event };
      if (socket) socket.send(message);
      this.broadcast(message);
    }
  }

  async start(name: string): Promise<RoomDump> {
    const room = this.logic();
    room.start(name);
    this.save(room);
    return room.dump();
  }

  async join(player: Player): Promise<RoomDump> {
    const room = this.logic();
    if (!room.started()) room.start("Untitled wilds");
    const before = room.currentSeq();
    room.join(player);
    this.save(room);
    this.publish(null, room, before);
    return room.dump();
  }

  async say(playerId: string, text: string): Promise<{ requestId: string }> {
    const room = this.logic();
    const before = room.currentSeq();
    const said = room.say(playerId, text);
    this.save(room);
    this.publish(null, room, before);
    return said;
  }

  async claimBatch(workerId: string): Promise<ReturnType<RoomLogic["claimBatch"]>> {
    const room = this.logic();
    const claimed = room.claimBatch(workerId);
    this.save(room);
    if (claimed) this.alarm.set(claimed.leaseUntil);
    return claimed;
  }

  async applyEdits(batch: EditBatch): Promise<ReturnType<RoomLogic["applyEdits"]>> {
    const room = this.logic();
    const before = room.currentSeq();
    const result = room.applyEdits(batch);
    this.save(room);
    this.publish(null, room, before);
    return result;
  }

  async postStatus(text: string, from = "Builder"): Promise<void> {
    const room = this.logic();
    const before = room.currentSeq();
    room.postStatus(text, from);
    this.save(room);
    this.publish(null, room, before);
  }

  async getState(): Promise<RoomDump> {
    return this.logic().dump();
  }

  async onAlarm(): Promise<void> {
    const room = this.logic();
    room.onAlarm(Date.now());
    this.save(room);
  }

  async onMessage(socket: Socket, message: Incoming): Promise<void> {
    if (message.type === "subscribe") {
      const room = this.logic();
      socket.send({ type: "state", dump: room.dump() });
      for (const event of room.eventsSince(message.since ?? 0)) socket.send({ type: "event", event });
      return;
    }
    if (message.type === "join") {
      await this.join(message.player);
      socket.send({ type: "state", dump: this.logic().dump() });
      return;
    }
    await this.say(message.playerId, message.text);
  }
}
