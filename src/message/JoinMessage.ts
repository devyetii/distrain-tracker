import { WebSocket } from 'ws';
import { MessageBase } from "./MessageBase";

export class JoinMessage extends MessageBase {
    /**
     *
     */
    constructor(ws: WebSocket, data: string) {
        super(ws, data);
    }

    handle(): void {
        this.ws.send(JSON.stringify({ type: "deviceId", data: ""}))
        console.log("A new device just joined");
    }
}