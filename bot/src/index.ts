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

  const rest = new REST().setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: [reportCommand.toJSON()],
  });

  console.log("Slash commands registered");
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
client.login(TOKEN);
