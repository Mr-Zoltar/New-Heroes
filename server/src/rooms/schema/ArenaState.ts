import { Schema, MapSchema, type } from "@colyseus/schema";
import { PLAYER_MAX_HP } from "@new-heroes/shared";

/**
 * A connected player. Only @type fields are synchronized to clients.
 * Position/velocity + lastSeq drive client reconciliation; hp/alive/aim/score
 * drive combat rendering and the HUD.
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

  // Combat (M2)
  @type("number") aim: number = 0; // aim angle in radians
  @type("uint16") hp: number = PLAYER_MAX_HP;
  @type("uint16") maxHp: number = PLAYER_MAX_HP;
  @type("boolean") alive: boolean = true;
  @type("uint16") kills: number = 0;
  @type("uint16") deaths: number = 0;
  @type("boolean") isBot: boolean = false;
}

/** Root synchronized room state. */
export class ArenaState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();

  // Horde mode (M3)
  @type("uint16") wave: number = 0;
  @type("uint16") botsAlive: number = 0;
}
