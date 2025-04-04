const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN
}));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let terminalSocket = null;

wss.on("connection", (ws, req) => {
  console.log("New client connected");

  ws.on("message", (message) => {
    const parsed = JSON.parse(message);
    if (parsed.type === "register-terminal") {
      terminalSocket = ws;
      console.log("Terminal registered");
    } else if (parsed.type === "user-message") {
      if (terminalSocket && terminalSocket.readyState === WebSocket.OPEN) {
        terminalSocket.send(JSON.stringify({ type: "user-message", data: parsed.data }));
      }
    } else if (parsed.type === "terminal-reply") {
      // Broadcast back to the user (assumes single client)
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "terminal-reply", data: parsed.data }));
        }
      });
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    if (terminalSocket === ws) terminalSocket = null;
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
