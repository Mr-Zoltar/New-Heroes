import { Client, type Room } from "colyseus.js";
import { SERVER_PORT, ROOM_NAME, type ClassId } from "@new-heroes/shared";

/**
 * Connects to the Colyseus server and joins (or creates) the arena room.
 * Uses the page hostname so it also works when opened from another device on the LAN.
 */
export async function connectToArena(className: ClassId): Promise<Room> {
  const endpoint = `http://${location.hostname}:${SERVER_PORT}`;
  const client = new Client(endpoint);
  return client.joinOrCreate(ROOM_NAME, { className });
}
