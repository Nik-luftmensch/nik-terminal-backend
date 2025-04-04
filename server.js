const http = require("http");
const WebSocket = require("ws");
const readline = require("readline");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Nik Terminal WebSocket server is running.");
});

const wss = new WebSocket.Server({ server });

let activeSocket = null;

wss.on("connection", (ws) => {
  console.log("✅ Client connected");
  activeSocket = ws;

  ws.on("message", (message) => {
    console.log(`👤 User: ${message}`);
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected");
    activeSocket = null;
  });
});

// Allow you to chat from terminal input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on("line", (input) => {
  if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
    activeSocket.send(input);
  } else {
    console.log("⚠️ No active client connected.");
  }
});

server.listen(PORT, () => {
  console.log(`🚀 WebSocket server running on port ${PORT}`);
});
