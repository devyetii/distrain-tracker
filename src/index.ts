import { DeviceRepository } from './common/DeviceRepository';
import { MessageFactory } from './message/MessageFactory';
import { WebSocket, MessageEvent } from 'ws';
import { v4 as uuid } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const port: number = +(process.env.PORT ? process.env.PORT : 9001);
const wss = new WebSocket.Server({ port })

wss.on('listening', () => {
  console.log(`Listening on port ${port}`);
});

const deviceRepo = new DeviceRepository(undefined);

wss.on('connection', async (ws, req) => {
  let deviceId = <string>req.headers['x-device-id'];
  let deviceAddress = <string>req.headers['x-device-address'];

  if (deviceId === "" || deviceId === null || deviceId === undefined) {
    deviceId = uuid();
    console.log("New device");
    await deviceRepo.createDevice({
      id: deviceId,
      status: "idle",
      last_login: new Date(Date.now()),
      address: deviceAddress,
    });
    ws.send(JSON.stringify({ type: 'deviceId', data: deviceId }));
  } else {
    console.log("Device found before");
    deviceRepo.updateDevice({
      id: deviceId,
      status: 'idle',
      last_login: new Date(Date.now()),
    });
  }

  deviceRepo.setStatus(deviceId, "idle");
  deviceRepo.setSocket(deviceId, ws);
  
  ws.addEventListener('message', (message: MessageEvent) => {
    const msgInstance = MessageFactory.createMessage(ws, <string>(message.data))
    msgInstance?.handle();
  });

  ws.addEventListener('close', ({code}) => {
    console.log(`Socket ${deviceId} closing ... Code`, code);
    deviceRepo.disconnectDevice(deviceId);
  });

  ws.addEventListener('error', (err) => {
    console.log(`Socket ${deviceId} error`);
    console.log(err);
    deviceRepo.disconnectDevice(deviceId);
  });
});