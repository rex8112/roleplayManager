const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction, Collection } = require('discord.js')


const { Roleplay } = require('../models/roleplay');
const { Character } = require('../models/character');
const { Information } = require('../models/information');
const { Player } = require('../models/player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('create')
        .setDescription('Create a new roleplay related thing!')
        .addSubcommand(subcommand =>
            subcommand
                .setName('roleplay')
                .setDescription('Create a new roleplay!')
                .addStringOption(option => 
                    option.setName('roleplayname')
                        .setDescription('The name of the roleplay.')
                        .setRequired(true))),
    /**
     * 
     * @param {CommandInteraction} interaction 
     */
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        if (interaction.options.getSubcommand() === 'roleplay') {
            const name = interaction.options.getString('roleplayname');
            const roleplay = await Roleplay.new(interaction.guild, name, interaction.member);
            interaction.client.roleplays.set(roleplay.id, roleplay);
        } else if (interaction.options.getSubcommand() === 'player') {
            const player = await Player.new(interaction.guild, interaction.member);
        } else if (interaction.options.getSubcommand() === 'character') {
            const name = interaction.options.getString('charactername');
            const player = await Player.getByMemberId(interaction.guild, interaction.member.id);
            const character = await Character.new(name);
            player.addCharacter(character);
        }
    },
};