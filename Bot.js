import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } from 'discord.js';
import dotenv from 'dotenv';

// Wczytaj zmienne środowiskowe
dotenv.config();

// Stała: próg zgłoszeń do bana
const BAN_THRESHOLD = 10;

// Mapa danych użytkowników
const userData = new Map();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Obsługa komendy !@ (panel zarządzania użytkownikiem)
client.on('messageCreate', async (message) => {
    if (message.content.startsWith('!@')) {
        const mentionedUser = message.mentions.users.first() || message.guild?.members.cache.get(message.content.split(' ')[1]);

        if (!mentionedUser) {
            message.reply('Nie znaleziono użytkownika!');
            return;
        }

        const userInfo = userData.get(mentionedUser.id) || {
            warnings: [],
            mutes: 0,
            flaggedAsUnverified: false,
            reports: new Set()
        };

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`Informacje o ${mentionedUser.tag}`)
            .addFields(
                { name: 'Liczba warnów', value: userInfo.warnings.length.toString(), inline: true },
                { name: 'Liczba mutów', value: userInfo.mutes.toString(), inline: true },
                { name: 'Liczba zgłoszeń', value: userInfo.reports.size.toString(), inline: true }
            );

        if (userInfo.warnings.length > 0) {
            embed.addFields({
                name: 'Ostatnie warny',
                value: userInfo.warnings.map(w => `Powód: ${w.reason}, Wydane przez: ${w.issuedBy}, Data: ${w.date}`).join('\n\n')
            });
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`warn_${mentionedUser.id}`)
                    .setLabel('Warn')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`mute_${mentionedUser.id}`)
                    .setLabel('Mute')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`report_${mentionedUser.id}`)
                    .setLabel('Zgłoś')
                    .setStyle(ButtonStyle.Primary)
            );

        await message.reply({ embeds: [embed], components: [row] });
    }
});

// Obsługa przycisków w panelu
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const [action, targetUserId] = interaction.customId.split('_');
    const targetUser = interaction.guild.members.cache.get(targetUserId)?.user;

    if (!targetUser) {
        await interaction.reply({ content: 'Nie znaleziono użytkownika!', ephemeral: true });
        return;
    }

    const userInfo = userData.get(targetUserId) || {
        warnings: [],
        mutes: 0,
        flaggedAsUnverified: false,
        reports: new Set()
    };

    switch (action) {
        case 'warn': {
            const reason = 'Przykładowy powód';
            userInfo.warnings.push({
                reason,
                issuedBy: interaction.user.tag,
                date: new Date().toLocaleString()
            });
            userData.set(targetUserId, userInfo);
            await interaction.reply(`Użytkownik ${targetUser.tag} otrzymał ostrzeżenie: ${reason}`);
            break;
        }
        case 'mute': {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                await interaction.reply({ content: 'Nie masz uprawnień do wyciszania użytkowników!', ephemeral: true });
                return;
            }

            const muteRole = interaction.guild.roles.cache.find(r => r.name === 'Muted');
            if (!muteRole) {
                await interaction.reply({ content: 'Rola "Muted" nie została znaleziona!', ephemeral: true });
                return;
            }

            const member = interaction.guild.members.cache.get(targetUserId);
            if (member) {
                await member.roles.add(muteRole, 'Mute przez bota');
                userInfo.mutes += 1;
                userData.set(targetUserId, userInfo);
                await interaction.reply(`Użytkownik ${targetUser.tag} został wyciszony.`);
            } else {
                await interaction.reply('Nie znaleziono użytkownika na serwerze.');
            }
            break;
        }
        case 'report': {
            if (userInfo.reports.has(interaction.user.id)) {
                await interaction.reply({ content: 'Już zgłosiłeś tego użytkownika!', ephemeral: true });
                return;
            }

            userInfo.reports.add(interaction.user.id);
            userData.set(targetUserId, userInfo);
            await interaction.reply(`Zgłosiłeś użytkownika ${targetUser.tag}. Liczba zgłoszeń: ${userInfo.reports.size}/${BAN_THRESHOLD}`);

            if (userInfo.reports.size >= BAN_THRESHOLD) {
                try {
                    await interaction.guild.members.ban(targetUserId, { reason: 'Przekroczenie progu zgłoszeń.' });
                    await interaction.followUp(`Użytkownik ${targetUser.tag} został zbanowany za przekroczenie limitu zgłoszeń.`);
                } catch (error) {
                    console.error(`Nie udało się zbanować użytkownika: ${error}`);
                }
            }
            break;
        }
    }
});

// Logowanie bota
client.login(process.env.TOKEN);
