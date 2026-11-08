export declare const MAX_ROOM_CODE_LENGTH = 24;
export declare const MAX_MESSAGE_BYTES = 2048;
export type ClientMessage = {
    type: "join";
    name: string;
} | {
    type: "ping";
};
export type ServerMessage = {
    type: "welcome";
    playerId: string;
    roomCode: string;
    people: number;
} | {
    type: "room_count";
    people: number;
} | {
    type: "error";
    message: string;
} | {
    type: "pong";
};
export type RoomSnapshot = {
    people: number;
};
export declare function isRoomCode(value: string): boolean;
export declare function isClientMessage(value: unknown): value is ClientMessage;
