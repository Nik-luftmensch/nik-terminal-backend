const http = require("http");
const WebSocket = require("ws");

// Port Render assigns dynamically
const PORT = process.env.PORT || 3000;

// Create a basic HTTP server (needed by Render)
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Nik Terminal WebSocket server is running.");
});

// Attach WebSocket to the HTTP server
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (message) => {
    console.log("Received:", message);
    ws.send(`Echo from Nik: ${message}`);
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
