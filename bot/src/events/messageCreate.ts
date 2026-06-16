import { Client, Events } from "discord.js";

export function registerMessageCreate(client: Client): void {
  const starsChannelId = process.env.STARS_CHANNEL_ID!;

  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot) return;
      if (message.channelId !== starsChannelId) return;

      const hasImage = message.attachments.some((a) =>
        a.contentType?.startsWith("image/"),
      );

      if (hasImage) {
        await message.react("⭐"); // ⭐
      }
    } catch (err) {
      // react 실패(권한/rate limit/메시지 삭제)가 봇을 죽이지 않게 — 로그 후 무시
      console.error("[StellaCode bot] messageCreate handler error:", err);
    }
  });
}
