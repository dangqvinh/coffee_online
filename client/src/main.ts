import type { ServerMessage } from "@quan-ca-phe/shared";
import "./style.css";

const form = document.querySelector<HTMLFormElement>("#join-form");
const nameInput = document.querySelector<HTMLInputElement>("#name");
const roomInput = document.querySelector<HTMLInputElement>("#room");
const status = document.querySelector<HTMLElement>("#status");
const count = document.querySelector<HTMLElement>("#count");
let socket: WebSocket | undefined;

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
  socket.addEventListener("open", () => {
    status!.textContent = "Đã vào quán";
    socket?.send(JSON.stringify({ type: "join", name }));
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data) as ServerMessage;
    if (message.type === "welcome" || message.type === "room_count") {
      count!.textContent = `Trong phòng: ${message.people} người`;
    }
    if (message.type === "error") status!.textContent = message.message;
  });
  socket.addEventListener("close", () => {
    status!.textContent = "Đã ngắt kết nối";
  });
  socket.addEventListener("error", () => {
    status!.textContent = "Không thể kết nối phòng";
  });
});
