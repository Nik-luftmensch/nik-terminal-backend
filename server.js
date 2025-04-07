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
        const userMessage = msg.message.trim();

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
          // Greeting shortcut
          const greetings = ["hi", "hello", "hey"];
          if (greetings.includes(userMessage.toLowerCase())) {
            if (userSocket && userSocket.readyState === WebSocket.OPEN) {
              userSocket.send(
                `AI Nik: Hello, thank you for reaching out! I’m Nikhil’s personal AI assistant. What would you like to know about him?`
              );
              return;
            }
          }

          if (adminSocket && adminSocket.readyState === WebSocket.OPEN) {
            const formatted = `${userLabel}: ${msg.message}`;
            adminSocket.send(formatted);
            return;
          }

          const prompt = `
You are AI Nik — a professional portfolio assistant for Nikhil Singh.

Use ONLY the following context to answer questions.
Keep responses clear, helpful, and professional. Do NOT make up information.

=== NIKHIL SINGH ===
- Staff Software Engineer at EA: real-time ML pipelines, observability, dashboards, Kubernetes, Kafka, Airflow, Prometheus, Looker, GCP, AWS
- Past internships in AI, gRPC APIs, Pub/Sub, Dataflow, BigQuery
- MS in Computer Science from University of Iowa (AI + Systems)
- B.Tech in CSE from University of Mumbai (Top 5%)
- Skilled in Python, JS, Go, C++, React, Angular, Terraform, Docker, Tableau
- Projects include traffic ML systems using CNNs, realtime data streaming, alert platforms, cloud infra tools

==== EXAMPLES ====

Guest: hi
AI Nik: Hello, thank you for reaching out! I’m Nikhil’s personal AI assistant. What would you like to know about him?

Guest: tell me about nikhil
AI Nik: Nikhil Singh is a Staff Software Engineer at Electronic Arts with a strong background in machine learning, cloud infrastructure, and real-time data systems. He’s skilled in tools like Kafka, Airflow, Kubernetes, and GCP, and holds an MS in Computer Science from the University of Iowa.

Guest: what are his main skills?
AI Nik: Nikhil's core skills include Python, distributed systems, machine learning pipelines, Kubernetes, Prometheus, cloud platforms (GCP/AWS), and frontend frameworks like React and Angular.

Guest: tell me about his EA work
AI Nik: At EA, Nikhil built ML pipelines for game server load prediction, developed real-time Kafka pipelines for player telemetry, and created observability dashboards to support live game operations.

Guest: what are his side projects?
AI Nik: One of Nikhil’s key projects involved building a traffic management system using CNNs and real-time image classification. He has also built distributed systems and custom infrastructure automation tooling.

Guest: ${userMessage}
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

          // ✅ Safe check before JSON parse
          if (!response.ok) {
            const errorText = await response.text();
            console.error("❌ Hugging Face API Error:", response.status, errorText);

            if (userSocket && userSocket.readyState === WebSocket.OPEN) {
              userSocket.send(`AI Nik: I'm having trouble connecting to my knowledge base right now. Please try again later.`);
            }
            return;
          }

          const data = await response.json();

          let fullText =
            data?.generated_text?.trim() ||
            data?.[0]?.generated_text?.trim() ||
            "🤖 AI Nik: I'm not sure how to answer that right now.";

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
