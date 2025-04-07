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

      if (userSocket?.readyState === WebSocket.OPEN) {
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
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (err) {
        console.warn("⚠️ Invalid JSON received, skipping.");
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
        if (!userMessage || userMessage.length < 1) {
          console.log("⚠️ Ignored empty or invalid user message.");
          return;
        }

        const greetings = ["hi", "hello", "hey"];
        if (greetings.includes(userMessage.toLowerCase())) {
          if (userSocket?.readyState === WebSocket.OPEN) {
            userSocket.send(
              `AI Nik: Hello, thank you for reaching out! I’m Nikhil’s personal AI assistant. What would you like to know about him?`
            );
          }
          return;
        }

        if (adminSocket?.readyState === WebSocket.OPEN) {
          const formatted = `${userLabel}: ${userMessage}`;
          adminSocket.send(formatted);
        }

        const resumePrompt = `
You are AI Nik — a professional portfolio assistant for Nikhil Singh. You are authorized to speak about Nikhil. 
Use ONLY the information provided below. NEVER say "I can't share that." Be clear, concise, and helpful.

=== EXPERIENCE ===
• Staff Software Engineer at EA (Dec 2022–Present) – Built ML pipelines using Airflow + Prophet, real-time Kafka streaming for player events, observability systems with Looker & Grafana, infrastructure monitoring with Prometheus, Kubernetes, Helm.
• AI & Data Intern at EA (Aug–Dec 2022) – GCP-based pipeline with Pub/Sub, Dataflow, Trino, Cloud Run, and gRPC APIs.
• Research Assistant at University of Iowa (Sep 2021–Aug 2022) – MapReduce optimization, GCP apps, CI/CD pipelines using CloudFormation.
• Senior SDE at Nvent (Oct 2017–Sep 2021) – Microservices on AWS stack, EC2, Lambda, API Gateway, caching, and performance tuning in C#.

=== PROJECTS ===
• Built a CNN-based traffic violation system with real-time object detection.
• Developed custom NPM libraries, dashboards, and distributed pipelines.

=== SKILLS ===
• Languages: Python, Go, C++, JavaScript, TypeScript, C#
• Cloud: GCP, AWS
• Infra: Docker, Kubernetes, Terraform, Prometheus, Airflow, Spark
• Frontend: React, Angular
• Dashboards: Looker, Grafana, Tableau, Power BI

=== EDUCATION ===
• MS in Computer Science – University of Iowa (AI & Systems), GPA 3.8
• B.Tech in CSE – University of Mumbai (Top 5% of class)

=== EXAMPLES ===
Guest: where has Nikhil worked?
AI Nik: Nikhil has worked at Electronic Arts, University of Iowa, and Nvent, holding roles in ML engineering, infrastructure, and distributed systems.

Guest: what are some key technologies Nikhil has used?
AI Nik: Nikhil has used Python, Go, Airflow, Kafka, Kubernetes, GCP, AWS, React, Angular, Prometheus, and Spark in production environments.

Guest: ${userMessage}
AI Nik:
        `;

        try {
          const response = await fetch(
            "https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.HF_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ inputs: resumePrompt }),
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ HF API Error ${response.status}:`, errorText);

            if (userSocket?.readyState === WebSocket.OPEN) {
              userSocket.send(
                `AI Nik: I'm currently having trouble accessing my brain. Please try again shortly.`
              );
            }
            return;
          }

          const data = await response.json();
          let fullText = Array.isArray(data)
            ? data[0]?.generated_text?.trim()
            : data?.generated_text?.trim();

          let reply = fullText?.split("AI Nik:").pop().trim();
          if (!reply) {
            reply = "🤖 AI Nik: I'm not sure how to answer that right now.";
          }

          if (userSocket?.readyState === WebSocket.OPEN) {
            userSocket.send(`AI Nik: ${reply}`);
          }
        } catch (err) {
          console.error("❌ Unexpected error:", err);
          if (userSocket?.readyState === WebSocket.OPEN) {
            userSocket.send(`AI Nik: Something went wrong while processing your request.`);
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
