export const MAX_ROOM_CODE_LENGTH = 24;
export const MAX_MESSAGE_BYTES = 2048;

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "ping" };

export type ServerMessage =
  | { type: "welcome"; playerId: string; roomCode: string; people: number }
  | { type: "room_count"; people: number }
  | { type: "error"; message: string }
  | { type: "pong" };

export type RoomSnapshot = {
  people: number;
};

export function isRoomCode(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_ROOM_CODE_LENGTH &&
    /^[a-z0-9-]+$/.test(value)
  );
}

export function isClientMessage(value: unknown): value is ClientMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (message.type === "ping") return true;
  return (
    message.type === "join" &&
    typeof message.name === "string" &&
    message.name.length <= 16
  );
}
