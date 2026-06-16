import {
  ActionRowBuilder,
  Client,
  Events,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { createIssue } from "../lib/github.js";
import { issueCreatedEmbed } from "../lib/embeds.js";
import { checkRateLimit } from "../lib/rateLimit.js";

const MODAL_ID = "report-modal";
const ONE_HOUR = 60 * 60 * 1000;

export const reportCommand = new SlashCommandBuilder()
  .setName("report")
  .setDescription("Report a bug or issue");

export function registerReportHandler(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === "report") {
      const modal = new ModalBuilder()
        .setCustomId(MODAL_ID)
        .setTitle("Bug Report");

      const title = new TextInputBuilder()
        .setCustomId("title")
        .setLabel("Title")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(true);

      const description = new TextInputBuilder()
        .setCustomId("description")
        .setLabel("Description")
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000)
        .setRequired(true);

      const steps = new TextInputBuilder()
        .setCustomId("steps")
        .setLabel("Steps to Reproduce")
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setRequired(false);

      const version = new TextInputBuilder()
        .setCustomId("version")
        .setLabel("Version")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(20)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(title),
        new ActionRowBuilder<TextInputBuilder>().addComponents(description),
        new ActionRowBuilder<TextInputBuilder>().addComponents(steps),
        new ActionRowBuilder<TextInputBuilder>().addComponents(version),
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === MODAL_ID) {
      const allowed = checkRateLimit(interaction.user.id, 3, ONE_HOUR);
      if (!allowed) {
        await interaction.reply({
          content: "Rate limited. You can submit up to 3 reports per hour.",
          ephemeral: true,
        });
        return;
      }

      const titleVal = interaction.fields.getTextInputValue("title");
      const descVal = interaction.fields.getTextInputValue("description");
      const stepsVal = interaction.fields.getTextInputValue("steps");
      const versionVal = interaction.fields.getTextInputValue("version");

      const body = [
        `**Reported by:** ${interaction.user.tag}`,
        `**Timestamp:** ${new Date().toISOString()}`,
        versionVal ? `**Version:** ${versionVal}` : "",
        "",
        "## Description",
        descVal,
        stepsVal ? `\n## Steps to Reproduce\n${stepsVal}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await interaction.deferReply({ ephemeral: true });

      try {
        const issue = await createIssue(titleVal, body, ["bug", "from-discord"]);

        await interaction.editReply({
          embeds: [issueCreatedEmbed(issue.html_url, titleVal)],
        });
      } catch (err) {
        // GitHub 이슈 생성 실패 시 무한 스피너 방지 — 사용자에게 명확히 안내(무음 금지)
        console.error("[StellaCode bot] createIssue failed:", err);
        try {
          await interaction.editReply({
            content:
              "리포트 등록에 실패했습니다. 잠시 후 다시 시도해주세요. (GitHub 연동 오류)",
          });
        } catch (replyErr) {
          console.error("[StellaCode bot] error reply also failed:", replyErr);
        }
      }
    }
  });
}
