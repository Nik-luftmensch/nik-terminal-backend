const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
dotenv.config();

// Fix fetch for CommonJS
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
          const userMessage = msg.message.trim().toLowerCase();

          // Custom greeting logic
          const greetings = ["hello", "hi", "hey"];
          if (greetings.includes(userMessage)) {
            if (userSocket && userSocket.readyState === WebSocket.OPEN) {
              userSocket.send(
                `AI Nik: Hello, thank you for reaching out! I’m Nikhil’s personal AI. What would you like to know about him?`
              );
              return;
            }
          }

          if (adminSocket && adminSocket.readyState === WebSocket.OPEN) {
            const formatted = `${userLabel}: ${msg.message}`;
            adminSocket.send(formatted);
            return;
          }

          // AI fallback using Phi-4-mini-instruct
          const prompt = `
You are AI Nik, a professional portfolio assistant for Nikhil Singh.

Use only the following resume info to answer questions:
- Staff Software Engineer at EA working on ML pipelines, observability, infrastructure, microservices, and dashboarding
- Internships in AI and cloud platforms using GCP (Pub/Sub, Dataflow, Cloud Run, BigQuery), gRPC APIs, Trino
- University of Iowa: Master's in CS (AI + Systems). University of Mumbai: B.Tech in CSE (Top 5%)
- Projects include traffic management using CNNs, ETL with Airflow, Kubernetes, Prometheus, Looker, Kafka, Spark
- Proficient in Python, JavaScript, C++, Go, Angular, React, Terraform, Docker, Tableau, etc.

Never invent information. Do not repeat the prompt. Answer naturally and helpfully.

Guest: ${msg.message}
AI Nik:`;

          const response = await fetch(
            "https://api-inference.huggingface.co/models/microsoft/Phi-4-mini-instruct",
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

          let fullText =
            data?.generated_text?.trim() ||
            data?.[0]?.generated_text?.trim() ||
            "🤖 AI Nik: I'm not sure how to answer that right now.";

          // Extract only after "AI Nik:"
          let reply = fullText.split("AI Nik:").pop().trim();
          if (!reply) {
            reply = "🤖 AI Nik: I'm not sure how to answer that right now.";
          }

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
