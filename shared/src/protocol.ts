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
  isAdmin: boolean;
  canBrew: boolean;
};

export type IngredientKind = "base" | "flavor" | "topping" | "temperature";
export type Ingredient = {
  id: string;
  name: string;
  kind: IngredientKind;
  taste: { sweet: number; bitter: number; creamy: number; sour: number; cool: number; fragrant: number; quirky: number; caffeine: number };
  cost: number;
};
export type DrinkState = {
  id: string;
  inventor: string;
  name: string;
  note: string;
  ingredients: string[];
  score: number;
  coins: number;
};
export type CustomerState = {
  id: string;
  name: string;
  story: string;
  request: string;
  table: number;
  patience: number;
  maxPatience: number;
  mood: "vui vẻ" | "trầm tư" | "tò mò";
};

export type ClientMessage =
  | { type: "join"; name: string; config: CharacterConfig; adminPin: string }
  | { type: "position"; x: number; z: number; vx: number; vz: number }
  | { type: "chat"; text: string }
  | { type: "emote"; emote: "wave" | "jump" | "cheers" }
  | { type: "set_brewer"; playerId: string; canBrew: boolean }
  | { type: "brew"; name: string; note: string; ingredients: string[] }
  | { type: "ping" };

export type ServerMessage =
  | { type: "welcome"; playerId: string; roomCode: string; people: number; players: PlayerState[]; customers: CustomerState[]; ingredients: Ingredient[]; coins: number; drinks: DrinkState[] }
  | { type: "room_count"; people: number }
  | { type: "player_joined"; player: PlayerState }
  | { type: "player_update"; player: PlayerState }
  | { type: "player_left"; playerId: string }
  | { type: "chat"; playerId: string; text: string }
  | { type: "emote"; playerId: string; emote: "wave" | "jump" | "cheers" }
  | { type: "customer_joined"; customer: CustomerState }
  | { type: "customer_update"; customer: CustomerState }
  | { type: "customer_left"; customerId: string }
  | { type: "progress"; coins: number; drinks: DrinkState[] }
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
      isCharacterConfig(message.config) &&
      typeof message.adminPin === "string" &&
      message.adminPin.length <= 32;
  }
  if (message.type === "position") {
    return [message.x, message.z, message.vx, message.vz].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    );
  }
  if (message.type === "chat") {
    return typeof message.text === "string" && message.text.length > 0 && message.text.length <= MAX_CHAT_LENGTH;
  }
  if (message.type === "set_brewer") {
    return typeof message.playerId === "string" && typeof message.canBrew === "boolean";
  }
  if (message.type === "brew") {
    return typeof message.name === "string" && message.name.length > 0 && message.name.length <= 32 &&
      typeof message.note === "string" && message.note.length <= 120 &&
      Array.isArray(message.ingredients) && message.ingredients.length >= 1 && message.ingredients.length <= 8 &&
      message.ingredients.every((item) => typeof item === "string" && item.length <= 32);
  }
  return message.type === "emote" && ["wave", "jump", "cheers"].includes(String(message.emote));
}
