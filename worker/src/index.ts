import {
  isClientMessage,
  isRoomCode,
  MAX_MESSAGE_BYTES,
  type ClientMessage,
  type ServerMessage,
} from "@quan-ca-phe/shared";

export interface Env {
  GAME_ROOMS: DurableObjectNamespace;
}

const encoder = new TextEncoder();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/room\/([^/]+)\/ws$/);

    if (!match) {
      return new Response("Quán Cà Phê Nhà Mình Worker đang hoạt động.", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    const roomCode = match[1];
    if (!isRoomCode(roomCode)) {
      return Response.json({ error: "Mã phòng không hợp lệ." }, { status: 400 });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Cần kết nối WebSocket.", { status: 426 });
    }

    const id = env.GAME_ROOMS.idFromName(roomCode);
    return env.GAME_ROOMS.get(id).fetch(
      new Request(`https://game-room.internal/room/${roomCode}/ws`, request),
    );
  },
};

export class GameRoom implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly sockets = new Map<WebSocket, string>();
  private roomCode = "";

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.roomCode = url.pathname.split("/")[2] ?? "";
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Cần kết nối WebSocket.", { status: 426 });
    }

    const people = this.sockets.size;
    if (people >= 6) {
      return Response.json({ error: "Phòng đã đủ 6 người." }, { status: 409 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    const playerId = crypto.randomUUID();
    this.state.acceptWebSocket(server);
    this.sockets.set(server, playerId);
    this.send(server, {
      type: "welcome",
      playerId,
      roomCode: this.roomCode,
      people: this.sockets.size,
    });
    this.broadcast({ type: "room_count", people: this.sockets.size }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    const bytes =
      typeof message === "string" ? encoder.encode(message).byteLength : message.byteLength;
    if (bytes > MAX_MESSAGE_BYTES) {
      this.send(socket, { type: "error", message: "Tin nhắn quá dài." });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      this.send(socket, { type: "error", message: "Tin nhắn không hợp lệ." });
      return;
    }
    if (!isClientMessage(parsed)) {
      this.send(socket, { type: "error", message: "Định dạng tin nhắn không hợp lệ." });
      return;
    }

    const clientMessage = parsed as ClientMessage;
    if (clientMessage.type === "ping") {
      this.send(socket, { type: "pong" });
    }
  }

  webSocketClose(socket: WebSocket): void {
    this.sockets.delete(socket);
    this.broadcast({ type: "room_count", people: this.sockets.size });
  }

  webSocketError(socket: WebSocket): void {
    this.sockets.delete(socket);
    this.broadcast({ type: "room_count", people: this.sockets.size });
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      this.sockets.delete(socket);
    }
  }

  private broadcast(message: ServerMessage, except?: WebSocket): void {
    for (const socket of this.sockets.keys()) {
      if (socket !== except) this.send(socket, message);
    }
  }
}
