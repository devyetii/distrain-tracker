import { WorkMessage } from './message/WorkMessage';
import { Task, TaskRepository } from './common/TaskRepository';
import { DeviceRepository } from './common/DeviceRepository';
import { MessageFactory } from './message/MessageFactory';
import { WebSocket, MessageEvent } from 'ws';
import { v4 as uuid } from 'uuid';
import http, { IncomingMessage, ServerResponse } from 'http';
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
const apiPort: number = +(process.env.API_PORT ? process.env.API_PORT : 8000);
const wss = new WebSocket.Server({ port })
const deviceRepo = new DeviceRepository(undefined);
const taskRepo: TaskRepository = new TaskRepository();
const s3 = new S3Client({ region: 'us-west-2' });

const requestListener = function (req: IncomingMessage, res: ServerResponse)
{
	res.setHeader("Content-Type", "application/json");
	if (req.url === '/task' && req.method === 'POST')
	{
		/*
			1- save task in db
			2- run scheduler or write in-place here
				2.1- check if #devices is sufficient
				2.2- if not, return error 
				2.3- if yes, loop to all devices and send task, list of all peers[id -> address], expiry model & chuck urls 
		*/
		const size: number = parseInt(req.headers[ 'content-length' ]!, 10);
		const buffer = Buffer.allocUnsafe(size);
		let pos: number = 0;
		req.on('data', (chunk) =>
		{
			chunk.copy(buffer, pos);
			pos += chunk.length;
		}).on('end', async () =>
		{
			const data = JSON.parse(buffer.toString());
			let task: Task = {
				id: uuid(),
				devices_count: data.device_count,
        dataType: data.data_type,
        dataTypeParams: data.data_type_params,
				params: data.params,
				status: 'new'
			};
			await taskRepo.addTask(task);
			console.log(deviceRepo.devices.length, task.devices_count);
			if (deviceRepo.devices.length >= task.devices_count)
			{
				const devices = await deviceRepo.devices;
				const peers: any = {};
				devices.forEach(device =>
				{
					peers[ device.id ] = device.address;
				});
				console.log(devices);
				const message = { peers };
				wss.clients.forEach((client, index) =>
				{
					if (client.readyState === WebSocket.OPEN)
					{
						// get model url
						// get chunk #index url
						client.send(JSON.stringify(message));
						console.log('sending peers to client ' + client.url);
					}
				});
				task.status = 'ongoing';
				await taskRepo.updateTask(task);
			}
			res.end('You Posted: ' + JSON.stringify(data));
		});
	}
}

const httpServer = http.createServer(requestListener);

httpServer.listen(process.env.API_PORT, () =>
{
	console.log(`API Listening on port ${apiPort}`);
});

wss.on('listening', () =>
{
	console.log(`Listening on port ${port}`);
});

wss.on('connection', async (ws, req) => {
  let deviceId = <string>req.headers['x-device-id'] || "";
  let deviceAddress = <string>req.headers['x-device-address'] || "";

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
      // Generate URL for metadata file
      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: `t${minTask.id}/m.json`,
      });
      const metadataUrl = await getSignedUrl(s3, command, { expiresIn: process.env.S3_URL_EXPIRY ? +(process.env.S3_URL_EXPIRY) : 3600 });

      
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
          metadata_url: metadataUrl,
          chunk_url: chunkUrl,
          data_type: minTask.dataType,
          data_type_params: minTask.dataTypeParams,
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
