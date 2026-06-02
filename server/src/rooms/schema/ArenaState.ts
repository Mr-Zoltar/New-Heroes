import { Schema, MapSchema, type } from "@colyseus/schema";

/**
 * A connected player. Only @type fields are synchronized to clients.
 * vx/vy + lastSeq are sent so the client can reconcile its predicted body
 * against this authoritative snapshot.
 */
export class Player extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") vx: number = 0;
  @type("number") vy: number = 0;
  @type("boolean") grounded: boolean = false;
  @type("int8") facing: number = 1;
  @type("uint32") lastSeq: number = 0;
  @type("string") color: string = "#ffffff";
}

/** Root synchronized room state. */
export class ArenaState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}
