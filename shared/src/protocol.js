export const MAX_ROOM_CODE_LENGTH = 24;
export const MAX_MESSAGE_BYTES = 2048;
export function isRoomCode(value) {
    return (value.length > 0 &&
        value.length <= MAX_ROOM_CODE_LENGTH &&
        /^[a-z0-9-]+$/.test(value));
}
export function isClientMessage(value) {
    if (!value || typeof value !== "object")
        return false;
    const message = value;
    if (message.type === "ping")
        return true;
    return (message.type === "join" &&
        typeof message.name === "string" &&
        message.name.length <= 16);
}
