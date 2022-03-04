// characterControl.js
const { Collection, Message, MessageActionRow, MessageButton, ButtonInteraction } = require('discord.js');

const { RoleplayControl } = require('./roleplayControl');
const { Character } = require('./character');
const { Roleplay } = require('./roleplay');

class CharacterControl extends RoleplayControl {
    /**
     * 
     * @param {Roleplay} roleplay 
     * @param {Character} character 
     */
    constructor(roleplay, character) {
        super(roleplay, character.getChannel(roleplay.guild));

        /**
         * @type {Character}
         */
        this.character = character;
        this.character.control = this;

        
        this.title = `${this.character.name} Control Panel`;
    }

    /**
     * 
     * @param {ButtonInteraction} interaction 
     * @param {*} command 
     * @returns 
     */
    async handleInteraction(interaction, command) {
        if (command === 'panelEditCharacter') {
            const channel = this.character.getChannel(this.roleplay.guild);
            const oldName = this.character.name;
            const oldColor = this.character.color;
            const neededData = {
                name: null,
                color: null,
            }
            const data = await this.collectData(neededData, 'Edit Character', channel, this.character.id, interaction.member);
            if (data.size === 0) return;
            if (data.get('name')) this.character.name = data.get('name');
            if (data.get('color')) this.character.color = data.get('color');
            try {
                await channel.edit({ name: this.character.getChannelName() });
            } catch (e) {
                this.character.name = oldName;
                this.character.color = oldColor;
                return interaction.editReply({ content: `An error occured while editing character.\n\`\`\`js\n${e.stack}\`\`\`` });
            }
            this.character.save();
            this.title = `${this.character.name} Control Panel`;
            await this.refresh();
            if (interaction.replied) return interaction.reply({ content: 'Edited.' })
            return interaction.editReply({ content: 'Edited.' });
        } else {
            return super.handleInteraction(interaction, command);
        }
    }

    getEmbeds() {
        const embeds = super.getEmbeds();
        const embed = embeds[0];
        embed.title = this.title;
        embed.description = 'This is the control panel for your character.';

        return embeds
    }

    getComponents() {
        const components = super.getComponents();
        components.unshift(
            new MessageActionRow()
                .addComponents(
                    new MessageButton()
                        .setCustomId(`rp.${this.roleplay.id}:panelEditCharacter`)
                        .setLabel('Edit Character')
                        .setStyle('PRIMARY'),
                )
        )

        return components;
    }
}

module.exports = {
    CharacterControl
}