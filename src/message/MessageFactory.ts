import { WebSocket } from 'ws';
import { JoinMessage } from "./JoinMessage";
import { MessageBase } from "./MessageBase";

export class MessageFactory {
    static createMessage(ws: WebSocket, message: string): MessageBase | null {
        let msg: MessageBase | null = null;
        console.log(message);
        try {
            const msgJson = JSON.parse(message);
            switch (msgJson["type"]) {
                case "join":
                    msg = new JoinMessage(ws, msgJson["body"]);
                default:
            }

        } catch {
            console.error("Error occured in parsing");
        }

        return msg;
    }
}