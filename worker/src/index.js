import { isClientMessage, isRoomCode, MAX_MESSAGE_BYTES, } from "@quan-ca-phe/shared";
const encoder = new TextEncoder();
export default {
    async fetch(request, env) {
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
        return env.GAME_ROOMS.get(id).fetch(new Request(`https://game-room.internal/room/${roomCode}/ws`, request));
    },
};
export class GameRoom {
    state;
    sockets = new Map();
    roomCode = "";
    constructor(state) {
        this.state = state;
    }
    async fetch(request) {
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
        const [client, server] = Object.values(pair);
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
    webSocketMessage(socket, message) {
        const bytes = typeof message === "string" ? encoder.encode(message).byteLength : message.byteLength;
        if (bytes > MAX_MESSAGE_BYTES) {
            this.send(socket, { type: "error", message: "Tin nhắn quá dài." });
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
        }
        catch {
            this.send(socket, { type: "error", message: "Tin nhắn không hợp lệ." });
            return;
        }
        if (!isClientMessage(parsed)) {
            this.send(socket, { type: "error", message: "Định dạng tin nhắn không hợp lệ." });
            return;
        }
        const clientMessage = parsed;
        if (clientMessage.type === "ping") {
            this.send(socket, { type: "pong" });
        }
    }
    webSocketClose(socket) {
        this.sockets.delete(socket);
        this.broadcast({ type: "room_count", people: this.sockets.size });
    }
    webSocketError(socket) {
        this.sockets.delete(socket);
        this.broadcast({ type: "room_count", people: this.sockets.size });
    }
    send(socket, message) {
        try {
            socket.send(JSON.stringify(message));
        }
        catch {
            this.sockets.delete(socket);
        }
    }
    broadcast(message, except) {
        for (const socket of this.sockets.keys()) {
            if (socket !== except)
                this.send(socket, message);
        }
    }
}
