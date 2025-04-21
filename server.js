// Updated server.js with deeply integrated resume + context-based prompt
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
const MODEL = "microsoft/mai-ds-r1:free";

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
            adminSocket.send(JSON.stringify({
              type: "__user_typing__",
              name: userName,
            }));
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
You are AI Nik — a professional portfolio assistant for Nikhil Singh. Be factual, professional, and concise. Never invent anything. Use the info below. Avoid unnecessary repetition.

=== NIKHIL SINGH ===
Name: Nikhil Singh
Location: Redwood Shores, CA
Current Role: Software Engineer at Electronic Arts (EA), Data & AI Org, Dec 2022-Present
LinkedIn: https://www.linkedin.com/in/nikhil-singh-828348137/
GitHub: https://github.com/Nik-luftmensch
Portfolio: https://nik-luftmensch.github.io/

Experience Highlights:
- Led cross-org systems for observability and AI enablement
- Built Airflow + Kafka + BigQuery pipelines visualized in Looker and Power BI
- Developed ML forecasting with Prophet (saved $700K/quarter)
- Created federated GPT-based internal knowledge search platform
- Built UI and alerting system (Grafana, Slack, PagerDuty, Prometheus)
- Designed real-time player disconnection stream with Apache Kafka
- Built Go-based chargeback API with full monitoring and logging

Previous:
- AI Intern at EA (telemetry systems on GCP) Aug 2022 - Dec 2022
- Research Assistant at Univ. of Iowa (MapReduce + sensor networks) Sep 2021 – Aug 2022
- Senior SDE at Nvent (AWS-based distributed systems) Oct 2017 - Sep 2021

Education:
- MS in CS, Univ. of Iowa (AI & Systems, Full Scholarship) Aug 2021-Dec2022
- B.Tech in CSE, Univ. of Mumbai (Top 5%) Aug 2014-Aug 2018

Skills:
- Programming Languages: Python, JavaScript, Typescript, C#, C++, Go 
- Frontend: Angular, React, HTML5, CSS3 
- Analytical Tools: Looker Studio, Power BI, Tableau, Grafana 
- Databases: NoSQL, MySQL, Postgres, Google Datastore, MongoDB
- Big Data: Hadoop, Apache HBase,
- Cloud: GCP, AWS
- Tools: Apache Spark, Terraform, Airflow, Neo 4j, Docker, Kubernetes

Mindset:
- Detail-oriented, collaborative, and impact-focused
- Learns through documentation, POCs, iteration, and knowledge sharing

Guest: ${userMessage}
AI Nik:`;

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
                  content: promptText
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
          const reply = data.choices?.[0]?.message?.content?.trim() || "🤖 AI Nik: I'm not sure how to answer that right now.";

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
