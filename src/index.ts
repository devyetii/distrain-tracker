import { WorkMessage } from "./message/WorkMessage";
import { Task, TaskRepository } from "./task/TaskRepository";
import { DeviceRepository } from "./device/DeviceRepository";
import { MessageFactory } from "./message/MessageFactory";
import { WebSocket, MessageEvent } from "ws";
import { v4 as uuid } from "uuid";
import http, { IncomingMessage, ServerResponse } from "http";
import dotenv from "dotenv";
import { createServer } from "http";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

dotenv.config();

/*
	- respond to trainer with links to upload data and metadata xx
	- update DB for task and devices status, and construct relations between devices and the task (will have property wich is number of the task), and between each other xx
	- test
*/

// createServer()
//   .listen(8080, () => {
//     console.log("HTTP server listening on 8080");
//   })
//   .on("request", (req, res) => {
//     console.log("Request!");
//     res.end("WOW");
//   });

const port: number = +(process.env.PORT ? process.env.PORT : 9001);
const apiPort: number = +(process.env.API_PORT ? process.env.API_PORT : 8000);
const wss = new WebSocket.Server({ port });
const deviceRepo = new DeviceRepository(undefined);
const taskRepo: TaskRepository = new TaskRepository();
const s3 = new S3Client({ region: "us-west-2" });

// Disconnect all devices
deviceRepo.resetAllDevicesStatus();

const requestListener = function (req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  console.log(req.url,req.method)
  if (req.url === "/task" && req.method === "POST") {
    /*
			1- save task in db
			2- run scheduler or write in-place here
				2.1- check if #devices is sufficient
				2.2- if not, return error 
				2.3- if yes, loop to all devices and send task, list of all peers[id -> address], expiry model & chuck urls 
		*/
    const size: number = parseInt(req.headers["content-length"]!, 10);
    const buffer = Buffer.allocUnsafe(size);
    let pos: number = 0;
    req
      .on("data", (chunk) => {
        chunk.copy(buffer, pos);
        pos += chunk.length;
      })
      .on("end", async () => {
        const data = JSON.parse(buffer.toString());
        let task: Task = {
          //id: uuid(),
          id: "test-123",
          devices_count: data.devices_count,
          dataType: data.data_type,
          dataTypeParams: data.data_type_params,
          multipleFiles: data.multiple_files,
          params: data.params,
          status: "new",
        };
        await taskRepo.addTask(task);

        const metadataCommand = new GetObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: `${task.id}/m.json`,
        });
        const metadataUrl = await getSignedUrl(s3, metadataCommand, { expiresIn: Number(process.env.S3_URL_EXPIRY) });

        let chunksUrl = [];
        for (let i = 0; i < task.devices_count; i++) {
          const chunkCommand = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: `${task.id}/c${i + 1}.zip`,
          });
          chunksUrl.push(await getSignedUrl(s3, chunkCommand, { expiresIn: Number(process.env.S3_URL_EXPIRY) }));
        }

        const response = {
          message: "please put your files inside a folder named with given task id",
          task,
          data,
          metadataUrl,
          chunksUrl,
        };
        console.log("========================= scheduler started =========================");
        await schedule();
        res.end(JSON.stringify(response));
      });
  }else if(req.url == "/devices" && req.method === "GET"){
    req
    .on("data",()=>{})
    .on("end", async () => {
      const response = await deviceRepo.getAllDevices();
      res.end(JSON.stringify(response));
    });
  }else if(req.url == "/task2" && req.method === "POST"){
    const size: number = parseInt(req.headers["content-length"]!, 10);
    const buffer = Buffer.allocUnsafe(size);
    let pos: number = 0;
    req
      .on("data", (chunk) => {
        chunk.copy(buffer, pos);
        pos += chunk.length;
      })
      .on("end", async () => {
        const data = JSON.parse(buffer.toString());
        console.log(data)
        let task: Task = {
          //id: uuid(),
          id: data.task_name,
          devices_count: data.devs.length,
          dataType: "csv",
          dataTypeParams: "",
          multipleFiles: false,
          params: "aa",
          status: "new",
        };
        await taskRepo.addTask(task);

        const metadataCommand = new GetObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: `${task.id}/${data.model_name}`,
        });
        const metadataUrl = await getSignedUrl(s3, metadataCommand, { expiresIn: Number(process.env.S3_URL_EXPIRY) });

        let chunksUrl = [];
        for (let i = 0; i < task.devices_count; i++) {
          const chunkCommand = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: `${task.id}/${data.devs[i].chunk}.zip`,
          });
          chunksUrl.push(await getSignedUrl(s3, chunkCommand, { expiresIn: Number(process.env.S3_URL_EXPIRY) }));
        }

        const response = {
          message: "please put your files inside a folder named with given task id",
          task,
          data,
          metadataUrl,
          chunksUrl,
        };
        console.log("========================= scheduler started =========================");
        await schedule2(data);
        res.end(JSON.stringify(response));
      });
  }
};

const httpServer = http.createServer(requestListener);

httpServer.listen(process.env.API_PORT, () => {
  console.log(`API Listening on port ${apiPort}`);
});

wss.on("listening", () => {
  console.log(`Listening on port ${port}`);
});

wss.on("connection", async (ws, req) => {
  let deviceId = <string>req.headers["x-device-id"] || "";
  let deviceAddress = <string>req.headers["x-device-address"] || "";

  if (deviceId === "" || deviceId === null || deviceId === undefined || true) {
    deviceId = uuid();
    console.log("New device: ", deviceId);
    await deviceRepo.createDevice({
      id: deviceId,
      status: "idle",
      last_login: new Date(Date.now()),
      address: deviceAddress,
    });
    ws.send(JSON.stringify({ type: "deviceId", data: deviceId }));
  } else {
    console.log("Device found before: ", deviceId);
    await deviceRepo.updateDevice({
      id: deviceId,
      status: "idle",
      address: deviceAddress,
      last_login: new Date(Date.now()),
    });
  }

  deviceRepo.setStatus(deviceId, "idle");
  deviceRepo.setSocket(deviceId, ws);

  ws.addEventListener("message", (message: MessageEvent) => {
    const msgInstance = MessageFactory.createMessage(ws, <string>message.data);
    msgInstance?.handle();
  });

  ws.addEventListener("close", ({ code }) => {
    console.log(`Socket ${deviceId} closing ... Code`, code);
    deviceRepo.disconnectDevice(deviceId);
  });

  ws.addEventListener("error", (err) => {
    console.log(`Socket ${deviceId} error`);
    console.log(err);
    deviceRepo.disconnectDevice(deviceId);
  });

  //await schedule();
});

async function schedule() {
  // Get the task with the least no of required mobiles
  const minTask = await taskRepo.getMinTask();
  console.log(minTask);
  if (minTask) {
    const idleDevices = await deviceRepo.getNIdleDevices(minTask.devices_count); // Should be connected devices and not busy
    const devicesList = idleDevices.map((d, i) => ({ number: i, ...d }));
    console.log(devicesList)
    let socket;
    if (idleDevices.length >= minTask.devices_count) {
      // Generate URL for metadata file
      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: `${minTask.id}/m.json`,
      });
      const metadataUrl = await getSignedUrl(s3, command, { expiresIn: Number(process.env.S3_URL_EXPIRY) });

      for (let [i, dev] of devicesList.entries()) {
        //  Get device socket
        console.log("dev1",dev);
        let otherDevicesList = devicesList.map((d) => ({ number: d.number, address: d.address })).sort((a, b) => a.number - b.number);
        console.log(otherDevicesList)
        socket = deviceRepo.getSocket(dev.id);

        // Prepare the message
        const command = new GetObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: `${minTask.id}/c${i + 1}.zip`,
        });
        const chunkUrl = await getSignedUrl(s3, command, { expiresIn: Number(process.env.S3_URL_EXPIRY) });

        const data = {
          task_id: minTask.id,
          number: dev.number,
          metadata_url: metadataUrl,
          chunk_url: chunkUrl,
          data_type: minTask.dataType,
          data_type_params: minTask.dataTypeParams,
          devices_list: otherDevicesList,
        };
        console.log("data",data)
        if (socket) {
          // Send the work message
          const msg = new WorkMessage(socket, JSON.stringify(data));
          msg.handle();
          // construct device mesh of network
          await deviceRepo.connectDeviceToTask(dev.id, minTask.id, dev.number);
          // connect working devices to their task
          const otherDevicesId: string[] = devicesList.filter((d) => d.id !== dev.id).map((d) => d.id);
          await deviceRepo.makeDevicesMesh(dev.id, otherDevicesId, minTask.id);
        } else {
          return false;
        }
        console.log(`Sent chunk ${i} to ${dev.id}`);
      }
      await taskRepo.updateTask(minTask.id, "ongoing");
    }
  }
}

async function schedule2(data:any) {
    const devicesList = data.devs.map((d:any, i:number) => ({ number: i, ...d,address:d.ip }));
    //console.log(devicesList)
    let socket;
    // Generate URL for metadata file
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: `${data.task_name}/${data.model_name}`,
    });
    const metadataUrl = await getSignedUrl(s3, command, { expiresIn: Number(process.env.S3_URL_EXPIRY) });

    for (let [i, dev] of devicesList.entries()) {
      //console.log("dev",dev);
      //  Get device socket
      let otherDevicesList = devicesList.map((d:any) => ({ number: d.number, address: d.address })).sort((a:any, b:any) => a.number - b.number);
      //console.log("other",otherDevicesList)
      socket = deviceRepo.getSocket(dev.id);

      // Prepare the message
      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: `${data.task_name}/${data.devs[i].chunk}.zip`,
      });
      const chunkUrl = await getSignedUrl(s3, command, { expiresIn: Number(process.env.S3_URL_EXPIRY) });

      const data1 = {
        task_id: data.task_name,
        number: dev.number,
        metadata_url: metadataUrl,
        chunk_url: chunkUrl,
        data_type: "csv",
        data_type_params: "a=k",
        devices_list: otherDevicesList,
      };
      //console.log("data1",data1)
      if (socket) {
        // Send the work message
        const msg = new WorkMessage(socket, JSON.stringify(data1));
        msg.handle();
        // construct device mesh of network
        await deviceRepo.connectDeviceToTask(dev.id, data.task_name, dev.number);
        // connect working devices to their task
        const otherDevicesId: string[] = devicesList.filter((d:any) => d.id !== dev.id).map((d:any) => d.id);
        await deviceRepo.makeDevicesMesh(dev.id, otherDevicesId, data.task_name);
      } else {
        return false;
      }
      console.log(`Sent chunk ${i} to ${dev.id}`);
    }
    await taskRepo.updateTask(data.task_name, "ongoing");
    
  
}
