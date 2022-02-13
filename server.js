const WebSocket = require('ws')

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 })

wss.on('connection', ws => {
  ws.on('message', message => {
    console.log(`Received message => ${message}`)
    ws.send(`ECHO ${message}`)
  })
})
