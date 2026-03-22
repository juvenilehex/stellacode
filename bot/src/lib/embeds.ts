import { EmbedBuilder, GuildMember } from "discord.js";

export function welcomeEmbed(member: GuildMember): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Welcome to the Observatory!")
    .setDescription(
      `<@${member.id}> just joined the observatory!\n\n` +
        "Run `npx stellacode` and share your constellation in <#show-your-stars>",
    )
    .setThumbnail(member.displayAvatarURL({ size: 128 }))
    .setTimestamp();
}

export function issueCreatedEmbed(url: string, title: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x238636)
    .setTitle("Bug Report Created")
    .setDescription(`**${title}**\n\n[View on GitHub](${url})`)
    .setTimestamp();
}
