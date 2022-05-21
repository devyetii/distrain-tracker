import { WebSocket } from 'ws';
import { MessageBase } from "./MessageBase";

export class WorkMessage extends MessageBase {

    constructor(ws: WebSocket, data: string) {
        super(ws, data);
    }

    public handle() {
        this.ws.send(JSON.stringify({ type: "work", data: this.data }));
    }
}