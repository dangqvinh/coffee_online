export interface Env {
    GAME_ROOMS: DurableObjectNamespace;
}
declare const _default: {
    fetch(request: Request, env: Env): Promise<Response>;
};
export default _default;
export declare class GameRoom implements DurableObject {
    private readonly state;
    private readonly sockets;
    private roomCode;
    constructor(state: DurableObjectState);
    fetch(request: Request): Promise<Response>;
    webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void;
    webSocketClose(socket: WebSocket): void;
    webSocketError(socket: WebSocket): void;
    private send;
    private broadcast;
}
