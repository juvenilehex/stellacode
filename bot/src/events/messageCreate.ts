import { Client, Events } from "discord.js";

export function registerMessageCreate(client: Client): void {
  const starsChannelId = process.env.STARS_CHANNEL_ID!;

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (message.channelId !== starsChannelId) return;

    const hasImage = message.attachments.some((a) =>
      a.contentType?.startsWith("image/"),
    );

    if (hasImage) {
      await message.react("\u2B50"); // ⭐
    }
  });
}
