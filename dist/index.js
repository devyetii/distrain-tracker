"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const helpers_1 = require("./helpers");
const uuid_1 = require("uuid");
const port = +(process.env.PORT ? process.env.PORT : 9001);
const wss = new ws_1.WebSocket.Server({ port });
let connected_devices = [];
wss.on('listening', () => {
    console.log(`Listening on port ${port}`);
});
wss.on('connection', (ws, req) => {
    // Add the new device
    const newDevice = {
        id: (0, uuid_1.v4)(),
        socket: ws,
        offer: null,
        answer: null,
        offer_done: false,
        answer_done: false,
        role: '',
        ices: [],
    };
    console.log(`Socket ${newDevice.id} opened`);
    connected_devices.push(newDevice);
    (0, helpers_1.sendMessage)(ws, 'id-', newDevice.id);
    ws.addEventListener('message', (message) => {
        const msg = JSON.parse(message);
        switch (msg.type) {
            default:
                console.log(`Unknown message ${msg.type} : ${msg.data}`);
                break;
        }
    });
    ws.addEventListener('close', (code) => {
        console.log(`Socket ${newDevice.id} closing ... Code = ${code}`);
        connected_devices = connected_devices.filter((dev) => dev.id !== newDevice.id);
    });
    ws.addEventListener('error', (err) => {
        console.log(`Socket ${newDevice.id} error`);
        console.log(err);
    });
});
