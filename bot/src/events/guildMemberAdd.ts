import { Client, Events, TextChannel } from "discord.js";
import { welcomeEmbed } from "../lib/embeds.js";

export function registerGuildMemberAdd(client: Client): void {
  const channelId = process.env.WELCOME_CHANNEL_ID!;

  client.on(Events.GuildMemberAdd, async (member) => {
    const channel = client.channels.cache.get(channelId) as
      | TextChannel
      | undefined;
    if (!channel) return;

    await channel.send({
      content: `<@${member.id}> just joined the observatory! Run \`npx stellacode\` and share your constellation in <#${process.env.STARS_CHANNEL_ID!}>`,
      embeds: [welcomeEmbed(member)],
    });
  });
}
