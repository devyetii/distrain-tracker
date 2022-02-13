const WebSocket = require('ws')

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 })

wss.on('connection', (ws, req) => {
  ws.on('message', message => {
    const ip = req.socket.remoteAddress;
    const port = req.socket.remotePort;
    const forwarded = req.headers['x-forwarded-for'];
    console.log(`Received message => ${message}`);
    ws.send(`ECHO ${message}. remoteAddr = ${ip}, remotePort = ${port}, x-forwarded-for = ${forwarded}`);
  });
});