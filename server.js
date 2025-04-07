const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
require("dotenv").config();

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
            adminSocket.send(JSON.stringify({
              type: "__user_typing__",
              name: userName
            }));
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

          // 🤖 AI Fallback using Hugging Face
          const prompt = `
You are Nikhil Singh, a Software Engineer at Electronic Arts with experience in cloud computing, distributed systems, AI/ML, and full-stack development. You are responding to questions in your interactive terminal-style portfolio.

Only answer questions related to your resume, skills, experience, or education. Do not guess or go off-topic.

Here is your professional background:

- Roles: Software Engineer at EA, former Research Assistant and Intern at EA and University of Iowa, ex-Senior SDE at Nvent
- Languages: Python, JavaScript, C++, C#, Go
- Frameworks & Tools: Angular, React, Airflow, Terraform, Spark, Neo4j, Docker, Kubernetes
- Cloud: GCP, AWS
- Data Tools: Looker Studio, Tableau, Power BI, Grafana
- Education: M.S. in Computer Science (AI & Systems), University of Iowa; B.Tech in CSE, University of Mumbai

User: ${userMessage}
Nikhil:
`;

          const response = await fetch("https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.HF_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ inputs: prompt })
          });

          const data = await response.json();
          const reply = data.generated_text || "🤖 AI Nik: I'm not sure how to answer that right now.";

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
