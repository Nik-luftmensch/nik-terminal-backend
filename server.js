const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === "/admin") {
    const filePath = path.join(__dirname, "admin.html");
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        return res.end("Error loading admin interface");
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(content);
    });
  } else {
    res.writeHead(200);
    res.end("Nik Terminal WebSocket server is running.");
  }
});

const wss = new WebSocket.Server({ noServer: true });

let userSocket = null;
let adminSocket = null;

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    const isAdmin = req.url === "/admin";
    wss.emit("connection", ws, req, isAdmin);
  });
});

wss.on("connection", (ws, req, isAdmin) => {
  if (isAdmin) {
    console.log("✅ Admin connected");
    adminSocket = ws;

    ws.on("message", (msg) => {
      // Typing event from admin
      if (msg === "__typing__") {
        if (userSocket && userSocket.readyState === WebSocket.OPEN) {
          userSocket.send("__admin_typing__");
        }
        return;
      }

      // Message to user
      if (userSocket && userSocket.readyState === WebSocket.OPEN) {
        userSocket.send(msg);
      }
    });

    ws.on("close", () => {
      console.log("❌ Admin disconnected");
      adminSocket = null;
    });
  } else {
    console.log("✅ User connected");
    userSocket = ws;
    let userLabel = "User";

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw);

        // User identity info
        if (msg.type === "identity") {
          userLabel = `${msg.location}@${msg.ip}_${msg.name || "User"}`;
          console.log("🆔 User identified as:", userLabel);
          return;
        }

        // Typing event from user
        if (msg.type === "typing") {
          if (adminSocket && adminSocket.readyState === WebSocket.OPEN) {
            adminSocket.send("__user_typing__");
          }
          return;
        }

        // If message is a chat message from the user
        if (msg.type === "chat") {
          const message = `${userLabel}: ${msg.message}`;
          if (adminSocket && adminSocket.readyState === WebSocket.OPEN) {
            adminSocket.send(message);
          }
        }
      } catch {
        // If it's not JSON, treat it as a plain message
      }
    });

    ws.on("close", () => {
      console.log("❌ User disconnected");
      userSocket = null;
    });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 WebSocket server running on port ${PORT}`);
});
