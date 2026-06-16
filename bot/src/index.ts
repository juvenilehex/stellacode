import http from "node:http";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
} from "discord.js";
import { reportCommand, registerReportHandler } from "./commands/report.js";
import { registerGuildMemberAdd } from "./events/guildMemberAdd.js";
import { registerMessageCreate } from "./events/messageCreate.js";

// ── Process-level safety net ────────────────────────────────────
// 핸들러/네트워크의 미처리 rejection이 봇 전체를 죽이지 않게 한다(Node 15+ 기본 종료).
// unhandledRejection: 복구 가능한 비동기 오류(Discord/GitHub API 일시 실패) — 로그 후 생존.
// uncaughtException: 런타임 상태 오염 가능 — 로그 후 exit(1)로 supervisor 재시작 유도(fail-loud).
process.on("unhandledRejection", (reason) => {
  console.error("[StellaCode bot] Unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[StellaCode bot] Uncaught exception — exiting for restart:", err);
  process.exit(1);
});

// ── Env validation ──────────────────────────────────────────────
const REQUIRED_ENV = [
  "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID",
  "DISCORD_GUILD_ID",
  "GITHUB_TOKEN",
  "WELCOME_CHANNEL_ID",
  "STARS_CHANNEL_ID",
] as const;

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const TOKEN = process.env.DISCORD_TOKEN!;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const GUILD_ID = process.env.DISCORD_GUILD_ID!;

// ── Client setup ────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ── Register event handlers ─────────────────────────────────────
registerReportHandler(client);
registerGuildMemberAdd(client);
registerMessageCreate(client);

// ── Ready: register slash commands ──────────────────────────────
client.once("ready", async () => {
  console.log(`Logged in as ${client.user!.tag}`);

  try {
    const rest = new REST().setToken(TOKEN);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: [reportCommand.toJSON()],
    });
    console.log("Slash commands registered");
  } catch (err) {
    console.error("[StellaCode bot] Slash command registration failed:", err);
  }
});

// ── Health server ───────────────────────────────────────────────
const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok" }));
});

const HEALTH_PORT = parseInt(process.env.PORT || "3000");
server.listen(HEALTH_PORT, () => {
  console.log(`Health server listening on port ${HEALTH_PORT}`);
});

// ── Login ───────────────────────────────────────────────────────
client.login(TOKEN).catch((err) => {
  console.error("[StellaCode bot] Login failed — exiting for restart:", err);
  process.exit(1);
});
