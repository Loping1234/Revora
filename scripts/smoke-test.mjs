import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_URL = process.env.SMOKE_APP_URL || "http://localhost:5173/";
const API_URL = process.env.SMOKE_API_URL || "http://127.0.0.1:5000";
const DEBUG_PORT = Number(process.env.SMOKE_CHROME_PORT || 9333);
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);

function findChrome() {
  const chrome = CHROME_PATHS.find((candidate) => fs.existsSync(candidate));
  if (!chrome) {
    throw new Error("Chrome or Edge was not found. Set CHROME_PATH to run the smoke test.");
  }
  return chrome;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJson(url, attempts = 40) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function loginSession() {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: process.env.SMOKE_ROLE || "admin",
      password: process.env.SMOKE_PASSWORD || "admin123"
    })
  });

  if (!response.ok) {
    throw new Error(`Smoke login failed with ${response.status}`);
  }

  const payload = await response.json();
  return payload.data;
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.socket = new WebSocket(url);
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
      this.socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.id && this.pending.has(message.id)) {
          const { resolve, reject } = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.error) reject(new Error(message.error.message));
          else resolve(message.result);
          return;
        }
        this.events.push(message);
      });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.socket.close();
  }
}

async function main() {
  const chromePath = findChrome();
  const userDataDir = path.join(os.tmpdir(), `dp-di-smoke-${Date.now()}`);
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank"
  ], { stdio: "ignore" });

  try {
    const [session] = await Promise.all([
      loginSession(),
      waitForJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`)
    ]);
    const targetResponse = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(APP_URL)}`, { method: "PUT" });
    const target = await targetResponse.json();
    const cdp = new CdpClient(target.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await cdp.send("Log.enable");
    await delay(1500);
    await cdp.send("Runtime.evaluate", {
      expression: `localStorage.setItem("dp_di_session", ${JSON.stringify(JSON.stringify(session))}); location.reload();`,
      awaitPromise: false
    });
    await delay(2500);

    const workspaces = ["Home", "Data Workspace", "Products", "Pricing Models", "Price Decisions", "Performance", "Reports & Export", "Settings"];
    for (const label of workspaces) {
      const result = await cdp.send("Runtime.evaluate", {
        expression: `
          (() => {
            const button = Array.from(document.querySelectorAll("button")).find((item) => item.textContent.includes(${JSON.stringify(label)}));
            if (button) button.click();
            return document.body.innerText;
          })()
        `,
        returnByValue: true
      });
      const bodyText = result.result?.value || "";
      if (!bodyText || bodyText.includes("App failed to render")) {
        throw new Error(`${label} failed to render`);
      }
      await delay(300);
    }

    const fatalEvents = cdp.events.filter((event) => {
      if (event.method === "Runtime.exceptionThrown") return true;
      if (event.method === "Log.entryAdded" && ["error", "assert"].includes(event.params?.entry?.level)) return true;
      if (event.method === "Runtime.consoleAPICalled" && event.params?.type === "error") return true;
      return false;
    });

    cdp.close();

    if (fatalEvents.length) {
      const sample = fatalEvents.slice(0, 8).map((event) => {
        if (event.method === "Runtime.exceptionThrown") {
          return event.params?.exceptionDetails?.text || event.params?.exceptionDetails?.exception?.description || "Runtime exception";
        }
        if (event.method === "Log.entryAdded") {
          return event.params?.entry?.text || "Log error";
        }
        if (event.method === "Runtime.consoleAPICalled") {
          return (event.params?.args || []).map((arg) => arg.value || arg.description || "").join(" ");
        }
        return event.method;
      }).filter(Boolean).join(" | ");
      throw new Error(`Frontend console/runtime errors detected: ${fatalEvents.length}. ${sample}`);
    }

    console.log("Smoke test passed: app loaded and all main workspaces rendered without runtime errors.");
  } finally {
    chrome.kill();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
