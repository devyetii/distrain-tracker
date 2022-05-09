import { WebSocket } from 'ws';
export abstract class MessageBase {
    data: any;
    ws: WebSocket;
    constructor(ws: WebSocket, data: any) {
        this.data = data;
        this.ws = ws;
    }
    abstract handle(): void;
}