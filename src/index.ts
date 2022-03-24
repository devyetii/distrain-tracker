import { WebSocket } from 'ws';
import { sendMessage } from './helpers';
import { v4 as uuid } from 'uuid';


const port: number = +(process.env.PORT ? process.env.PORT : 9001);

const wss = new WebSocket.Server({ port })

let connected_devices: any[] = [];

wss.on('listening', () => {
  console.log(`Listening on port ${port}`);
});

wss.on('connection', (ws, req) => {
  // Add the new device
  const newDevice = { 
    id: uuid(),
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
  sendMessage(ws, 'id-', newDevice.id);

  ws.addEventListener('message', (message: any) => {
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