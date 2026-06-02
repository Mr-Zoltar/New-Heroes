import { listen } from "@colyseus/tools";
import app from "./app.config";
import { SERVER_PORT } from "@new-heroes/shared";

// Boots the Colyseus server on SERVER_PORT (WebSocket + matchmaking HTTP).
listen(app, SERVER_PORT);
console.log(`[server] New Heroes listening on http://localhost:${SERVER_PORT}`);
