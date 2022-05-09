import { MemoryStorage } from './common/MemoryStorage';
import { MessageFactory } from './message/MessageFactory';
import { WebSocket, MessageEvent } from 'ws';
import { v4 as uuid } from 'uuid';

interface Device {
  id: string;
  socket: WebSocket;
}


const port: number = +(process.env.PORT ? process.env.PORT : 9001);

const wss = new WebSocket.Server({ port })

let connected_devices: any[] = [];

wss.on('listening', () => {
  console.log(`Listening on port ${port}`);
});

const memStore = new MemoryStorage(undefined);

wss.on('connection', async (ws, req) => {
  let newDevice: Device;
  let deviceId = req.headers['x-device-id'];

  const deviceSocket = await memStore.get(`${deviceId}`);
  
  if (deviceSocket === "" || deviceSocket === null) {
    deviceId = uuid();
    console.log("New device");
    memStore.set(deviceId, "Connected");
    ws.send(JSON.stringify({ type: 'deviceId', data: deviceId }));
  } else {
    console.log("Device found before");
  }
  
  ws.addEventListener('message', (message: MessageEvent) => {
    const msgInstance = MessageFactory.createMessage(ws, <string>(message.data))
    msgInstance?.handle();
  });

  ws.addEventListener('close', (code) => {
    console.log(`Socket ${deviceId} closing ... Code`, code);
    connected_devices = connected_devices.filter((dev) => dev.id !== newDevice.id);
  });

  ws.addEventListener('error', (err) => {
    console.log(`Socket ${deviceId} error`);
    console.log(err);
  });
});