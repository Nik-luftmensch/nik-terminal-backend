// Enhanced WebSocket AI Resume Assistant for Nikhil Singh with admin override and clean labels
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
dotenv.config();

const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
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

      if (userSocket?.readyState === WebSocket.OPEN) {
        userSocket.send(`Nik: ${msg}`); // Admin messages labeled Nik
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
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (err) {
        console.warn("⚠️ Invalid JSON received.");
        return;
      }

      const userMessage = msg?.message?.trim();

      if (msg.type === "identity") {
        userName = msg.name || "User";
        userLabel = `${msg.location}@${msg.ip}_${userName}`;
        return;
      }

      if (msg.type === "typing") {
        if (adminSocket?.readyState === WebSocket.OPEN) {
          adminSocket.send(JSON.stringify({ type: "__user_typing__", name: userName }));
        }
        return;
      }

      if (msg.type === "chat") {
        if (!userMessage) return;

        const greetings = ["hi", "hello", "hey"];
        if (greetings.includes(userMessage.toLowerCase())) {
          if (userSocket?.readyState === WebSocket.OPEN) {
            userSocket.send("AI Nik: Hello! I'm Nikhil's personal AI assistant. What would you like to know?");
          }
          return;
        }

        if (adminSocket?.readyState === WebSocket.OPEN) {
          adminSocket.send(`${userLabel}: ${userMessage}`);
          return; // Do not trigger AI if admin is active
        }

        // Send typing indicator to user
        if (userSocket?.readyState === WebSocket.OPEN) {
          userSocket.send("__ai_typing__");
        }

        const resumePrompt = `You are AI Nik, a personal portfolio assistant for Nikhil Singh. Answer the following using ONLY the data below:

EDUCATION:
- MS in Computer Science (AI & Systems), University of Iowa (GPA 3.8/4.0)
- B.Tech in Computer Science, University of Mumbai (Top 5%, GPA 4.0)

EXPERIENCE:
- Staff Software Engineer, EA: Built Airflow + Prophet ML pipeline for server load prediction, real-time Kafka streaming for telemetry, observability dashboards (Looker), Kubernetes deployments, alerting with Prometheus, etc.
- AI & Data Intern, EA: GCP-based telemetry pipeline using Pub/Sub, Trino, BigQuery, Cloud Run, gRPC APIs.
- Research Assistant, Univ of Iowa: GCP web apps, CI/CD with CloudFormation, river sensor MapReduce optimization.
- Sr Software Engineer, Nvent: AWS microservices (EC2, Lambda, SQS, ECS), caching, performance tuning in C#.

PROJECT:
- Built CNN-based traffic management system with image classification.

SKILLS:
- Python, Go, C++, JS, TypeScript, React, Angular, Terraform, Docker, Airflow, Kubernetes, Spark, Tableau, GCP, AWS.

Guest: ${userMessage}
AI Nik:`;

        try {
          const response = await fetch("https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.HF_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ inputs: resumePrompt })
          });

          if (!response.ok) {
            const errText = await response.text();
            console.error("HF API Error:", response.status, errText);
            if (userSocket?.readyState === WebSocket.OPEN) {
              userSocket.send("AI Nik: I'm currently having trouble answering. Please try again soon.");
            }
            return;
          }

          const data = await response.json();
          let fullText = Array.isArray(data) ? data[0]?.generated_text?.trim() : data?.generated_text?.trim();
          let reply = fullText?.split("AI Nik:").pop().trim();

          if (!reply) reply = "AI Nik: I'm not sure how to answer that.";
          if (userSocket?.readyState === WebSocket.OPEN) userSocket.send(`AI Nik: ${reply}`);
        } catch (err) {
          console.error("Unexpected error:", err);
          if (userSocket?.readyState === WebSocket.OPEN) {
            userSocket.send("AI Nik: Something went wrong processing your request.");
          }
        }
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
