import { WebSocket } from 'ws';
import { MessageBase } from "./MessageBase";

export class WorkMessage extends MessageBase {

    constructor(ws: WebSocket, data: string) {
        super(ws, data);
    }

    public handle() {
        console.log("Data Socket",JSON.stringify({ type: "work", data: this.data }));

        this.ws.send(JSON.stringify({ type: "work", data: this.data }));
    }
}