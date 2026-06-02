import { Schema, MapSchema, type } from "@colyseus/schema";

/**
 * A connected player. Only fields decorated with @type are synchronized to clients.
 * M0: just position + a display color. HP, class, weapon, etc. arrive in later milestones.
 */
export class Player extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") color: string = "#ffffff";
}

/** Root synchronized room state. */
export class ArenaState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}
