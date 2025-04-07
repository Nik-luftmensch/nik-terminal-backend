const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
dotenv.config();

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "google/gemini-2.5-pro-exp-03-25:free";

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
      const raw = msg.toString();

      if (raw === "__typing__") {
        if (userSocket?.readyState === WebSocket.OPEN) {
          userSocket.send("__admin_typing__");
        }
        return;
      }

      if (raw.startsWith("__")) return;

      if (userSocket?.readyState === WebSocket.OPEN) {
        userSocket.send(`Nik: ${raw}`);
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
        const userMessage = msg?.message?.trim();

        if (msg.type === "identity") {
          userName = msg.name || "User";
          userLabel = `${msg.location}@${msg.ip}_${userName}`;
          return;
        }

        if (msg.type === "typing") {
          if (adminSocket?.readyState === WebSocket.OPEN) {
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
          if (adminSocket?.readyState === WebSocket.OPEN) {
            const formatted = `${userLabel}: ${userMessage}`;
            adminSocket.send(formatted);
            return;
          }

          const promptText = `
You are AI Nik — a professional portfolio assistant for Nikhil Singh.
Only respond using the info below. Be concise, polite, and professional. Never invent facts.

=== NIKHIL SINGH ===
- Software Engineer at EA: ML pipelines (Airflow, Prophet), Kafka systems, observability tools (Looker, Grafana), cloud infra (GCP, AWS, Kubernetes)
- Previous roles: AI Intern at EA, Research Assistant at Iowa, Senior SDE at Nvent
- MS in CS from University of Iowa (AI + Systems); B.Tech in CSE from University of Mumbai (Top 5%)
- Skills: Python, Go, C++, React, Angular, Docker, Terraform, Spark, Tableau

Guest: ${userMessage}
AI Nik:
          `;

          if (userSocket?.readyState === WebSocket.OPEN) {
            userSocket.send("__ai_typing__");
          }

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "http://localhost",
              "X-Title": "nik-terminal"
            },
            body: JSON.stringify({
              model: MODEL,
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: promptText
                    }
                  ]
                }
              ]
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error("❌ OpenRouter API Error:", response.status, errorText);

            if (userSocket?.readyState === WebSocket.OPEN) {
              userSocket.send(`AI Nik: I'm having trouble connecting to my brain. Please try again shortly.`);
            }
            return;
          }

          const data = await response.json();
          const reply = data.choices?.[0]?.message?.content?.[0]?.text?.trim() || "🤖 AI Nik: I'm not sure how to answer that right now.";

          if (userSocket?.readyState === WebSocket.OPEN) {
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
