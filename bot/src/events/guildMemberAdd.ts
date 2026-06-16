import { Client, Events, TextChannel } from "discord.js";
import { welcomeEmbed } from "../lib/embeds.js";

export function registerGuildMemberAdd(client: Client): void {
  const channelId = process.env.WELCOME_CHANNEL_ID!;

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      const channel = client.channels.cache.get(channelId) as
        | TextChannel
        | undefined;
      if (!channel) return;

      await channel.send({
        content: `<@${member.id}> just joined the observatory! Run \`npx stellacode\` and share your constellation in <#${process.env.STARS_CHANNEL_ID!}>`,
        embeds: [welcomeEmbed(member)],
      });
    } catch (err) {
      // send 실패(권한/네트워크)가 봇을 죽이지 않게 — 로그 후 무시
      console.error("[StellaCode bot] guildMemberAdd handler error:", err);
    }
  });
}
