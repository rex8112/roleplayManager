// characterControl.js
const { Collection, Message, TextChannel, MessageActionRow, MessageButton, Interaction, ButtonInteraction } = require('discord.js');

const { ControlPanel } = require('./controlPanel');
const { Character } = require('./character');
const { Roleplay } = require('./roleplay');

class RoleplayControl extends ControlPanel {
    /**
     * 
     * @param {Roleplay} roleplay 
     * @param {TextChannel} channel 
     */
    constructor(roleplay, channel) {
        super(channel);
        /**
         * @type {Roleplay}
         */
        this.roleplay = roleplay;
        this.roleplay.controlPanels.set(channel.id, this);

        this.title = `Roleplay Control Panel`;
    }

    /**
     * 
     * @param {ButtonInteraction} interaction 
     * @param {string} command 
     */
    async handleInteraction(interaction, command) {
        if (command === 'panelRefresh') {
            await this.refresh();
            if (interaction.replied) {
                return interaction.reply({ content: 'Refreshed.' });
            }
            return interaction.editReply({ content: 'Refreshed.' });
        } else {
            return super.handleInteraction(interaction, command);
        }
    }

    getEmbeds() {
        const embeds = super.getEmbeds();
        const embed = embeds[0];
        embed.description = 'Generic RP Control Panel';

        return embeds
    }

    getComponents() {
        const components = super.getComponents();
        components.unshift(
            new MessageActionRow()
                .addComponents(
                    new MessageButton()
                        .setCustomId(`rp.${this.roleplay.id}:panelRefresh`)
                        .setLabel('Refresh')
                        .setStyle('SECONDARY'),
                )
        )

        return components;
    }
}

module.exports = {
    RoleplayControl,
}