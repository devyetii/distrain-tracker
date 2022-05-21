import { WorkMessage } from './message/WorkMessage';
import { TaskRepository } from './common/TaskRepository';
import { DeviceRepository } from './common/DeviceRepository';
import { MessageFactory } from './message/MessageFactory';
import { WebSocket, MessageEvent } from 'ws';
import { v4 as uuid } from 'uuid';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

dotenv.config();

createServer().listen(8080, () => { console.log("HTTP server listening on 8080")}).on('request', (req, res) => {
  console.log("Request!")
  res.end("WOW");
});

const port: number = +(process.env.PORT ? process.env.PORT : 9001);
const wss = new WebSocket.Server({ port })
const taskRepo = new TaskRepository();
const s3 = new S3Client({ region: 'us-west-2' });

wss.on('listening', () => {
  console.log(`WS Server Listening on port ${port}`);
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

  await schedule();
});

async function schedule() {
  // Get the task with the least no of required mobiles
  const minTask = await taskRepo.getMinTask();
  console.log(minTask)
  if (minTask) {
    const idleDevices = await deviceRepo.getNIdleDevices(minTask.devices_count); // Should be connected devices and not busy
    const devicesList = idleDevices.map((d, i) => ({
      number: i+1,
      ...d
    }));
    let socket;
    if (idleDevices.length >= minTask.devices_count) {
      for (let [i, dev] of devicesList.entries()) {
        //  Get device socket
        let otherDevicesList = devicesList.filter(d => d.id !== dev.id).map(d => ({ number: d.number, address: d.address }));
        socket = deviceRepo.getSocket(dev.id);
        
        // Prepare the message
        const command = new GetObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: `t${minTask.id}/c${i+1}.zip`,
        });
        const chunkUrl = await getSignedUrl(s3, command, { expiresIn: process.env.S3_URL_EXPIRY ? +(process.env.S3_URL_EXPIRY) : 3600 });
        
        const data = {
          task_id: minTask.id,
          number: dev.number,
          params: minTask.params,
          chunk_url: chunkUrl,
          devices_list: otherDevicesList,
        };

        if (socket) {
          const msg = new WorkMessage(socket, JSON.stringify(data));
          msg.handle()
        } else {
          return false;
        }

        console.log(`Sent chunk ${i} to ${dev.id}`)
      }
    }
  }
}