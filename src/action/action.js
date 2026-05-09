"use strict";

const fs = require("fs");
const https = require("https");
const path = require("path");
const { scan, shouldFail } = require("../core/orchestrator");
const { formatMarkdown, formatSarif, formatScan } = require("../utils/format");

function input(name, fallback = "") {
  const key = `INPUT_${name.toUpperCase().replace(/-/g, "_")}`;
  return process.env[key] || fallback;
}

function boolInput(name, fallback = false) {
  const value = input(name, fallback ? "true" : "false");
  return String(value).toLowerCase() === "true";
}

function request(method, url, token, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      method,
      hostname: parsed.hostname,
      path: `${parsed.pathname}${parsed.search}`,
      headers: {
        "User-Agent": "dep-doctor-action",
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`GitHub API ${res.statusCode}: ${data}`));
      });
    });
    req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

async function maybeComment(markdown) {
  if (!boolInput("comment-on-pr")) return;
  const token = input("github-token") || process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token || !repo || !eventPath || !fs.existsSync(eventPath)) return;
  const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  const issueNumber = event.pull_request && event.pull_request.number;
  if (!issueNumber) return;
  const api = process.env.GITHUB_API_URL || "https://api.github.com";
  await request("POST", `${api}/repos/${repo}/issues/${issueNumber}/comments`, token, { body: markdown });
}

async function main() {
  const target = path.resolve(process.cwd(), input("path", "."));
  const result = await scan(target, {
    baseline: boolInput("baseline", true),
    updateBaseline: boolInput("update-baseline", false),
    workspaces: input("workspaces", "auto"),
    skip: input("skip", ""),
    ignore: input("ignore", ""),
    config: input("config", "") || undefined,
    baselinePath: input("baseline-path", "") || undefined
  });
  const format = input("format", "table");
  process.stdout.write(formatScan(result, { format }));

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, formatMarkdown(result), "utf8");
  }
  if (boolInput("upload-sarif")) {
    fs.writeFileSync(path.join(process.cwd(), "dep-doctor.sarif"), formatSarif(result), "utf8");
  }
  await maybeComment(formatMarkdown(result, { diffOnly: true }));
  if (shouldFail(result, input("fail-on", "critical"))) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`dep-doctor action failed: ${error.message}\n`);
    if (process.env.DEBUG) process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main };
