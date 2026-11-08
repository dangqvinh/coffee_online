import {
  isClientMessage,
  isRoomCode,
  MAX_MESSAGE_BYTES,
  MAX_PLAYERS,
  type PlayerState,
  type CustomerState,
  type DrinkState,
  type ClientMessage,
  type ServerMessage,
} from "@quan-ca-phe/shared";
import { INGREDIENTS, scoreDrink } from "@quan-ca-phe/shared/game-data";

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
  private readonly sockets = new Map<WebSocket, PlayerState>();
  private readonly lastMessageAt = new Map<WebSocket, number>();
  private readonly customers = new Map<string, CustomerState>();
  private nextCustomerAt = 0;
  private readonly drinks: DrinkState[] = [];
  private coins = 0;
  private ownerPinHash = "";
  private readonly progressReady: Promise<void>;
  private roomCode = "";

  constructor(state: DurableObjectState) {
    this.state = state;
    this.progressReady = this.loadProgress();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.roomCode = url.pathname.split("/")[2] ?? "";
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Cần kết nối WebSocket.", { status: 426 });
    }

    if (this.sockets.size >= MAX_PLAYERS) {
      return Response.json({ error: "Phòng đã đủ 6 người." }, { status: 409 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    const playerId = crypto.randomUUID();
    const spawn = spawnPosition(this.sockets.size);
    this.state.acceptWebSocket(server);
    this.sockets.set(server, {
      id: playerId,
      name: "Khách mới",
      config: { skin: "honey", shirt: "teal", hat: "conical", apron: true },
      x: spawn.x,
      z: spawn.z,
      vx: 0,
      vz: 0,
      isAdmin: false,
      canBrew: false,
    });
    this.broadcast({ type: "room_count", people: this.sockets.size }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
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
    const player = this.sockets.get(socket);
    if (!player) return;
    const now = Date.now();
    const previousMessageAt = this.lastMessageAt.get(socket) ?? 0;
    const minimumInterval = clientMessage.type === "position" ? 65 : clientMessage.type === "chat" ? 500 : 100;
    if (now - previousMessageAt < minimumInterval) return;
    this.lastMessageAt.set(socket, now);

    if (clientMessage.type === "join") {
      await this.progressReady;
      const pinHash = await hashPin(clientMessage.adminPin);
      if (!this.ownerPinHash) {
        if (!clientMessage.adminPin) {
          this.send(socket, { type: "error", message: "Chủ phòng cần đặt PIN admin." });
          return;
        }
        this.ownerPinHash = pinHash;
        await this.state.storage.put("ownerPinHash", this.ownerPinHash);
        player.isAdmin = true;
        player.canBrew = true;
      } else if (pinHash && pinHash === this.ownerPinHash) {
        player.isAdmin = true;
        player.canBrew = true;
      }
      player.name = clientMessage.name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 16);
      player.config = clientMessage.config;
      this.send(socket, { type: "welcome", playerId: player.id, roomCode: this.roomCode, people: this.sockets.size, players: [...this.sockets.values()], customers: [...this.customers.values()], ingredients: INGREDIENTS, coins: this.coins, drinks: this.drinks });
      this.broadcast({ type: "player_joined", player }, socket);
      this.ensureCustomerAlarm();
      return;
    }
    if (clientMessage.type === "position") {
      player.x = clamp(clientMessage.x, -8.5, 8.5);
      player.z = clamp(clientMessage.z, -5.5, 5.5);
      player.vx = clamp(clientMessage.vx, -6, 6);
      player.vz = clamp(clientMessage.vz, -6, 6);
      this.broadcast({ type: "player_update", player }, socket);
      return;
    }
    if (clientMessage.type === "chat") {
      this.broadcast({ type: "chat", playerId: player.id, text: cleanText(clientMessage.text, 60) });
      return;
    }
    if (clientMessage.type === "emote") {
      this.broadcast({ type: "emote", playerId: player.id, emote: clientMessage.emote });
      return;
    }
    if (clientMessage.type === "set_brewer") {
      if (!player.isAdmin) return;
      const target = [...this.sockets.values()].find((item) => item.id === clientMessage.playerId);
      if (!target) return;
      target.canBrew = clientMessage.canBrew;
      this.broadcast({ type: "player_update", player: target });
      return;
    }
    if (clientMessage.type === "brew") {
      if (!player.canBrew) {
        this.send(socket, { type: "error", message: "Bạn chưa được phân công pha chế." });
        return;
      }
      const validIngredients = clientMessage.ingredients.filter((id) => INGREDIENTS.some((item) => item.id === id));
      if (!validIngredients.length) return;
      const result = scoreDrink(validIngredients, [...this.customers.values()][0]);
      const drink: DrinkState = {
        id: crypto.randomUUID(),
        inventor: player.name,
        name: cleanText(clientMessage.name, 32),
        note: cleanText(clientMessage.note, 120),
        ingredients: validIngredients,
        score: result.score,
        coins: result.coins,
      };
      this.drinks.push(drink);
      this.coins += result.coins;
      await this.state.storage.put("coins", this.coins);
      await this.state.storage.put("drinks", this.drinks);
      this.broadcast({ type: "progress", coins: this.coins, drinks: this.drinks });
      return;
    }
    if (clientMessage.type === "ping") {
      this.send(socket, { type: "pong" });
    }
  }

  webSocketClose(socket: WebSocket): void {
    const player = this.sockets.get(socket);
    this.sockets.delete(socket);
    this.lastMessageAt.delete(socket);
    if (player) this.broadcast({ type: "player_left", playerId: player.id });
    this.broadcast({ type: "room_count", people: this.sockets.size });
  }

  webSocketError(socket: WebSocket): void {
    this.webSocketClose(socket);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    for (const customer of [...this.customers.values()]) {
      customer.patience = Math.max(0, customer.patience - 5);
      if (customer.patience === 0) {
        this.customers.delete(customer.id);
        this.broadcast({ type: "customer_left", customerId: customer.id });
      } else {
        this.broadcast({ type: "customer_update", customer });
      }
    }
    if (this.sockets.size > 0 && this.customers.size < 4 && now >= this.nextCustomerAt) {
      const customer = createCustomer(this.customers, now);
      this.customers.set(customer.id, customer);
      this.broadcast({ type: "customer_joined", customer });
      this.nextCustomerAt = now + 12000;
    }
    if (this.sockets.size > 0) await this.state.storage.setAlarm(now + 1000);
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

  private ensureCustomerAlarm(): void {
    if (this.nextCustomerAt === 0) {
      this.nextCustomerAt = Date.now() + 3000;
      void this.state.storage.setAlarm(this.nextCustomerAt);
    }
  }

  private async loadProgress(): Promise<void> {
    this.ownerPinHash = (await this.state.storage.get<string>("ownerPinHash")) ?? "";
    this.coins = (await this.state.storage.get<number>("coins")) ?? 0;
    const storedDrinks = await this.state.storage.get<DrinkState[]>("drinks");
    if (storedDrinks) this.drinks.push(...storedDrinks);
  }
}

function spawnPosition(playerIndex: number): { x: number; z: number } {
  const positions = [
    { x: 0, z: 3.8 },
    { x: 2.2, z: 3.8 },
    { x: -2.2, z: 3.8 },
    { x: 0, z: 1.1 },
    { x: 2.2, z: 1.1 },
    { x: -2.2, z: 1.1 },
  ];
  return positions[playerIndex] ?? positions[0];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function cleanText(value: string, maximumLength: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maximumLength);
}

async function hashPin(pin: string): Promise<string> {
  if (!pin) return "";
  const data = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createCustomer(customers: Map<string, CustomerState>, now: number): CustomerState {
  const templates = [
    { name: "Chị Mai", story: "Vừa tan ca, chị muốn tìm chút bình yên.", request: "Một ly ngọt nhẹ, thơm và mát.", mood: "trầm tư" as const },
    { name: "Bạn Nam", story: "Nam đang tìm cảm hứng cho bài hát mới.", request: "Một ly cà phê đậm, có vị lạ.", mood: "tò mò" as const },
    { name: "Cô Hạnh", story: "Cô Hạnh ghé quán sau buổi đi chợ.", request: "Một thức uống béo, thơm, không quá lạnh.", mood: "vui vẻ" as const },
  ];
  const template = templates[customers.size % templates.length];
  return {
    id: `customer-${now}-${customers.size}`,
    ...template,
    table: customers.size % 4,
    patience: 100,
    maxPatience: 100,
  };
}
