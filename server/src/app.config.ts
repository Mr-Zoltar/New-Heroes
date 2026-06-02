import config from "@colyseus/tools";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ArenaRoom } from "./rooms/ArenaRoom";
import { ROOM_NAME } from "@new-heroes/shared";

// @colyseus/tools wires up Express (with CORS + JSON body parsing) and the
// matchmaking HTTP routes, so the Vite-served client (different origin) can
// reach the server without CORS errors.
export default config({
  initializeTransport: () => new WebSocketTransport(),

  initializeGameServer: (gameServer) => {
    gameServer.define(ROOM_NAME, ArenaRoom);
  },

  initializeExpress: (app) => {
    app.get("/health", (_req, res) => {
      res.json({ ok: true });
    });
  },
});
