export const MAX_ROOM_CODE_LENGTH = 24;
export const MAX_MESSAGE_BYTES = 2048;
export const MAX_CHAT_LENGTH = 60;
export const MAX_NAME_LENGTH = 16;
export const MAX_PLAYERS = 6;

export type CharacterConfig = {
  skin: "honey" | "peach" | "cocoa" | "rose" | "cream";
  shirt: "teal" | "tomato" | "blue" | "leaf" | "plum" | "yellow" | "coral" | "navy";
  hat: "conical" | "cap" | "none";
  apron: boolean;
};

export type PlayerState = {
  id: string;
  name: string;
  config: CharacterConfig;
  x: number;
  z: number;
  vx: number;
  vz: number;
};

export type ClientMessage =
  | { type: "join"; name: string; config: CharacterConfig }
  | { type: "position"; x: number; z: number; vx: number; vz: number }
  | { type: "chat"; text: string }
  | { type: "emote"; emote: "wave" | "jump" | "cheers" }
  | { type: "ping" };

export type ServerMessage =
  | { type: "welcome"; playerId: string; roomCode: string; people: number; players: PlayerState[] }
  | { type: "room_count"; people: number }
  | { type: "player_joined"; player: PlayerState }
  | { type: "player_update"; player: PlayerState }
  | { type: "player_left"; playerId: string }
  | { type: "chat"; playerId: string; text: string }
  | { type: "emote"; playerId: string; emote: "wave" | "jump" | "cheers" }
  | { type: "error"; message: string }
  | { type: "pong" };

export function isRoomCode(value: string): boolean {
  return value.length > 0 && value.length <= MAX_ROOM_CODE_LENGTH && /^[a-z0-9-]+$/.test(value);
}

export function isCharacterConfig(value: unknown): value is CharacterConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as Record<string, unknown>;
  return (
    typeof config.skin === "string" &&
    ["honey", "peach", "cocoa", "rose", "cream"].includes(config.skin) &&
    typeof config.shirt === "string" &&
    ["teal", "tomato", "blue", "leaf", "plum", "yellow", "coral", "navy"].includes(config.shirt) &&
    typeof config.hat === "string" &&
    ["conical", "cap", "none"].includes(config.hat) &&
    typeof config.apron === "boolean"
  );
}

export function isClientMessage(value: unknown): value is ClientMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (message.type === "ping") return true;
  if (message.type === "join") {
    return typeof message.name === "string" &&
      message.name.length > 0 &&
      message.name.length <= MAX_NAME_LENGTH &&
      isCharacterConfig(message.config);
  }
  if (message.type === "position") {
    return [message.x, message.z, message.vx, message.vz].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    );
  }
  if (message.type === "chat") {
    return typeof message.text === "string" && message.text.length > 0 && message.text.length <= MAX_CHAT_LENGTH;
  }
  return message.type === "emote" && ["wave", "jump", "cheers"].includes(String(message.emote));
}
