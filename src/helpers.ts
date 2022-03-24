import { WebSocket } from "ws";

export function sendMessage(socket: WebSocket, type: string, data: string) {
    console.log("Hot")
    const message = { type, data };
    socket.send(JSON.stringify(message));
}