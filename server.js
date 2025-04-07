const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
dotenv.config();

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

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
      if (msg === "__typing__") {
        if (userSocket && userSocket.readyState === WebSocket.OPEN) {
          userSocket.send("__admin_typing__");
        }
        return;
      }

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
    let userName = "User";

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw);

        if (msg.type === "identity") {
          userName = msg.name || "User";
          userLabel = `${msg.location}@${msg.ip}_${userName}`;
          return;
        }

        if (msg.type === "typing") {
          if (adminSocket && adminSocket.readyState === WebSocket.OPEN) {
            adminSocket.send(
              JSON.stringify({
                type: "__user_typing__",
                name: userName,
              })
            );
          }
          return;
        }

        if (msg.type === "chat") {
          const userMessage = msg.message;

          if (adminSocket && adminSocket.readyState === WebSocket.OPEN) {
            const formatted = `${userLabel}: ${userMessage}`;
            adminSocket.send(formatted);
            return;
          }

          // 🧠 AI Fallback (when admin not connected)
          const prompt = `
You are Nikhil Singh, a Software Engineer at Electronic Arts. You are answering questions from a guest interacting with your terminal-style portfolio. Stay professional and only reply about your skills, work experience, education, or resume.

Background:
- Staff Software Engineer at EA
- M.S. in Computer Science, University of Iowa
- B.Tech in CSE, University of Mumbai
- Former roles at EA, Nvent, and University of Iowa
- Languages: C++, Python, Java, Go, C#
- Tools: Docker, Kubernetes, Terraform, Airflow, Spark
- Cloud: AWS, GCP
- Data: Tableau, Power BI, Looker Studio
- Web: Angular, React, Node.js

Guest: ${userMessage}
Nikhil:
`;

          const response = await fetch(
            "https://api-inference.huggingface.co/models/microsoft/phi-1_5",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.HF_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ inputs: prompt }),
            }
          );

          const data = await response.json();

          const reply =
            data?.generated_text?.trim() ||
            data?.[0]?.generated_text?.trim() ||
            "🤖 AI Nik: I'm not sure how to answer that right now.";

          if (userSocket && userSocket.readyState === WebSocket.OPEN) {
            userSocket.send(`AI Nik: ${reply}`);
          }
        }
      } catch (err) {
        console.error("❌ Error handling message:", err);
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
