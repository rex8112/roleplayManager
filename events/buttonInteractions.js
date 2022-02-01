const { Interaction } = require('discord.js');

const { Player } = require('../models/player');
const { Roleplay } = require('../models/roleplay');

module.exports = {
    name: 'interactionCreate',
    /**
     * 
     * @param {Interaction} interaction 
     */
    async execute(interaction) {
        if (!interaction.isButton()) return;

        const client = interaction.client;
        const regex = /rp\.([0-9]{1,}):([a-z]+)/g;
        const str = interaction.customId;
        let m;

        if ((m = regex.exec(str)) !== null) {
            const roleplayId = parseInt(m[1]);
            const command = m[2];
            const roleplay = /** @type {Roleplay} */ (client.roleplays.get(roleplayId));

            if (!roleplay) return interaction.reply({ content: 'Could not find the roleplay.', ephemeral: true });

            await interaction.deferReply({ ephemeral: true });
            await roleplay.handleButtonInteraction(interaction, command);
        }
    },
};