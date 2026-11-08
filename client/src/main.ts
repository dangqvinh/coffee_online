import type { CustomerState, PlayerState, ServerMessage } from "@quan-ca-phe/shared";
import { startCafeGame } from "./game";
import "./style.css";

const form = document.querySelector<HTMLFormElement>("#join-form");
const nameInput = document.querySelector<HTMLInputElement>("#name");
const roomInput = document.querySelector<HTMLInputElement>("#room");
const status = document.querySelector<HTMLElement>("#status");
const count = document.querySelector<HTMLElement>("#count");
const lobby = document.querySelector<HTMLElement>("#lobby");
const game = document.querySelector<HTMLElement>("#game");
const leaveButton = document.querySelector<HTMLButtonElement>("#leave-game");
let socket: WebSocket | undefined;
let stopGame: (() => void) | undefined;
let remoteApi: {
  addRemotePlayer: (state: PlayerState) => void;
  removeRemotePlayer: (playerId: string) => void;
  showRemoteChat: (playerId: string, text: string) => void;
  playRemoteEmote: (playerId: string, emote: "wave" | "jump" | "cheers") => void;
} | undefined;
let customerApi: {
  addCustomer: (customer: CustomerState) => void;
  updateCustomer: (customer: CustomerState) => void;
  removeCustomer: (customerId: string) => void;
} | undefined;
let currentPlayerId = "";
let startPosition = { x: 0, z: 3.8 };
let lastPositionSent = 0;
let lastSentPosition = "";

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = nameInput?.value.trim() ?? "";
  const room = roomInput?.value.trim().toLowerCase() ?? "";
  if (!name || !room) return;

  socket?.close();
  const workerOrigin = import.meta.env.VITE_WORKER_URL ?? window.location.origin;
  const workerUrl = new URL(`/room/${room}/ws`, workerOrigin);
  workerUrl.protocol = workerUrl.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(workerUrl);
  status!.textContent = "Đang kết nối…";
  let gameStarted = false;
  const launchGame = () => {
    if (gameStarted) return;
    gameStarted = true;
    lobby?.classList.add("hidden");
    game?.classList.add("active");
    stopGame = startCafeGame(game!, name, {
      startPosition,
      onExit: () => {
        game?.classList.remove("active");
        lobby?.classList.remove("hidden");
      },
      onPosition: (x, z, vx, vz) => {
        const now = performance.now();
        const position = `${x.toFixed(2)},${z.toFixed(2)},${vx.toFixed(2)},${vz.toFixed(2)}`;
        if (now - lastPositionSent < 80 || position === lastSentPosition) return;
        lastPositionSent = now;
        lastSentPosition = position;
        socket?.send(JSON.stringify({ type: "position", x, z, vx, vz }));
      },
      onRemoteReady: (api) => {
        remoteApi = api;
      },
      onCustomerReady: (api) => {
        customerApi = api;
      },
    });
  };
  socket.addEventListener("open", () => {
    status!.textContent = "Đã vào quán";
    socket?.send(JSON.stringify({
      type: "join",
      name,
      config: { skin: "honey", shirt: "teal", hat: "conical", apron: true },
    }));
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data) as ServerMessage;
    if (message.type === "welcome" || message.type === "room_count") {
      count!.textContent = `Trong phòng: ${message.people} người`;
    }
    if (message.type === "welcome") {
      currentPlayerId = message.playerId;
      const localPlayer = message.players.find((player) => player.id === currentPlayerId);
      if (localPlayer) {
        startPosition = { x: localPlayer.x, z: localPlayer.z };
      }
      launchGame();
      for (const player of message.players) {
        if (player.id !== currentPlayerId) remoteApi?.addRemotePlayer(player);
      }
      for (const customer of message.customers) customerApi?.addCustomer(customer);
    }
    if (message.type === "player_joined" && message.player.id !== currentPlayerId) {
      remoteApi?.addRemotePlayer(message.player);
    }
    if (message.type === "player_update") remoteApi?.addRemotePlayer(message.player);
    if (message.type === "player_left") remoteApi?.removeRemotePlayer(message.playerId);
    if (message.type === "chat") remoteApi?.showRemoteChat(message.playerId, message.text);
    if (message.type === "emote") remoteApi?.playRemoteEmote(message.playerId, message.emote);
    if (message.type === "customer_joined") customerApi?.addCustomer(message.customer);
    if (message.type === "customer_update") customerApi?.updateCustomer(message.customer);
    if (message.type === "customer_left") customerApi?.removeCustomer(message.customerId);
    if (message.type === "error") status!.textContent = message.message;
  });
  socket.addEventListener("close", () => {
    status!.textContent = "Đã ngắt kết nối";
  });
  socket.addEventListener("error", () => {
    status!.textContent = "Không thể kết nối phòng";
  });
});

leaveButton?.addEventListener("click", () => {
  stopGame?.();
  stopGame = undefined;
  socket?.close();
});

document.querySelector<HTMLFormElement>("#chat-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector<HTMLInputElement>("#chat-input");
  const text = input?.value.trim().slice(0, 60) ?? "";
  if (!text) return;
  socket?.send(JSON.stringify({ type: "chat", text }));
  input!.value = "";
});

window.addEventListener("keydown", (event) => {
  const emotes = { "1": "wave", "2": "jump", "3": "cheers" } as const;
  const emote = emotes[event.key as keyof typeof emotes];
  if (emote && game?.classList.contains("active")) {
    socket?.send(JSON.stringify({ type: "emote", emote }));
  }
});
