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
        if (userSocket?.readyState === WebSocket.OPEN) {
          userSocket.send("__admin_typing__");
        }
        return;
      }

      // 💬 Filter typing signals (so they're not treated as messages)
      ws.on("message", (msg) => {
        const raw = msg.toString(); // 🧼 Ensure string
      
        if (raw === "__typing__") {
          if (userSocket?.readyState === WebSocket.OPEN) {
            userSocket.send("__admin_typing__");
          }
          return;
        }
      
        // ⛔ Skip non-user-visible signals
        if (raw.startsWith("__")) return;
      
        if (userSocket?.readyState === WebSocket.OPEN) {
          userSocket.send(`Nik: ${raw}`);
        }
      });
      
      // 👤 Forward admin message to user (with clear "Nik" label)
      if (userSocket?.readyState === WebSocket.OPEN) {
        userSocket.send(`Nik: ${msg}`);
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
          // 📩 Show in admin dashboard if connected
          if (adminSocket?.readyState === WebSocket.OPEN) {
            const formatted = `${userLabel}: ${userMessage}`;
            adminSocket.send(formatted);
            return;
          }

          // 🤖 AI fallback mode
          const prompt = `
You are AI Nik — a professional portfolio assistant for Nikhil Singh.
Only respond using the info below. Be concise, polite, and professional. Never invent facts.

=== NIKHIL SINGH ===
- Staff Software Engineer at EA: ML pipelines (Airflow, Prophet), Kafka systems, observability tools (Looker, Grafana), cloud infra (GCP, AWS, Kubernetes)
- Previous roles: AI Intern at EA, Research Assistant at Iowa, Senior SDE at Nvent
- MS in CS from University of Iowa (AI + Systems); B.Tech in CSE from University of Mumbai (Top 5%)
- Skills: Python, Go, C++, React, Angular, Docker, Terraform, Spark, Tableau

Guest: ${userMessage}
AI Nik:
          `;

          if (userSocket?.readyState === WebSocket.OPEN) {
            userSocket.send("__ai_typing__");
          }

          const response = await fetch(
            "https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.HF_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ inputs: prompt }),
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error("❌ Hugging Face API Error:", response.status, errorText);

            if (userSocket?.readyState === WebSocket.OPEN) {
              userSocket.send(`AI Nik: I'm having trouble connecting to my brain. Please try again shortly.`);
            }
            return;
          }

          const data = await response.json();
          let fullText = Array.isArray(data)
            ? data[0]?.generated_text?.trim()
            : data?.generated_text?.trim();

          let reply = fullText?.split("AI Nik:").pop().trim();
          if (!reply || reply.length < 1) {
            reply = "🤖 AI Nik: I'm not sure how to answer that right now.";
          }

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
