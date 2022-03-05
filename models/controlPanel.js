// characterControl.js
const { Collection, Message, TextChannel, MessageEmbed, MessageActionRow, GuildMember, Channel, MessageButton, Interaction } = require('discord.js');

class ControlPanel {
    /**
     * 
     * @param {TextChannel} channel
     */
    constructor(channel) {
        /** @type {TextChannel} */
        this.channel = channel;
        /** @type {string} */
        this.title = `Control Panel`;
        this.messageID = null;
    }

    /**
     * 
     * @returns {Promise<Message>}
     */
    async getMessage() {
        if (this.message) return this.message;
        try {
            if (this.messageID) {
                const message = await this.channel.messages.fetch(this.messageID);
                this.message = message;
            } else {
                const messages = await this.channel.messages.fetch();
                let controlMessage = null;
                for (const message of messages.values()) {
                    if (message.embeds.length > 0 && message.embeds[0].title === this.title) {
                        controlMessage = message;
                        break;
                    }
                }
                this.message = controlMessage;
            }
        } catch (e) {
            this.message = null;
        }
        return this.message;
    }
    
    /**
     * Refresh the character controller.
     * @param {boolean} edit Whether to edit the message or post a new one. Defaults to false.
     */
    async refresh(edit = false) {
        const message = await this.getMessage();
        const embeds = this.getEmbeds();
        const components = this.getComponents();

        if (message === null || edit === false) {
            if (message) message.delete();
            try {
                this.message = await this.channel.send({ embeds, components });
            } catch (e) {
                this.message = null;
            }
        } else {
            await message.edit({ embeds, components });
        }
    }

    /**
     * Collect data from the user.
     * @param {Object<string, function>} data The data to be added to the message with an optional input validation function.
     * @param {string} title The title of the embed.
     * @param {Channel} channel The channel to collect data in.
     * @param {GuildMember} member The member to collect data from.
     * @returns {Promise<Map<string, any>> | Promise<null>} The collected data.
     */
    async collectData(data, title, channel, member) {
        const embed = new MessageEmbed()
            .setTitle(title)
            .setColor('ORANGE');
        
        const keys = Object.keys(data);
        // Create new map of blank values.
        const values = new Map();
        for (const key of keys) {
            values.set(key, null);
        }
        // Send initial embed.
        let message = await channel.send({ embeds: [embed] });
        let repeat = true;
        // Repeat until the user has declared finished or it is timed out.
        while (repeat) {
            let str = '';
            for(const [key, value] of values.entries()) {
                str += `${key}: ${value}\n`;
            }
            embed.setDescription(`Current data:\n${str}`);
            embed.setColor(data.color);
            const fields = new Array();
            fields.push(
                {
                    name: 'Available Commands:',
                    value: '`set <key> <value>`\n`finish`\n`cancel`',
                }
            )
            embed.setFields(fields);
            await message.edit({ embeds: [embed] });
            // Wait for user input.
            // TODO: Add member check.
            const response = await channel.awaitMessages({ max: 1, time: 600_000 });
            // Check if the user replied at all.
            if (response.size === 0) {
                await channel.send('You did not respond in time. Cancelling.');
                return null;
            }
            const responseMessage = response.first();
            const regex = /set ([a-z]{1,25}) ([ #a-zA-Z0-9]{1,26})/gm
            let m;
            if (responseMessage.content === 'finish') {
                repeat = false;
                break;
            } else if (responseMessage.content === 'cancel') {
                await channel.send('Cancelled.');
                return null;                
            } else if ((m = regex.exec(responseMessage.content)) !== null) {
                const key = m[1];
                const value = m[2];
                if (keys.includes(key)) {
                    let newValue = value;
                    // If a function is provided, run value through it.
                    if (data[key]) {
                        newValue = data[key](value);
                    }
                    values.set(key, newValue);
                }
            }
        }
        // Delete the message.
        await message.delete();
        return values;
    }

    /**
     * Handle the interaction.
     * @param {Interaction} interaction Discord Interaction.
     * @param {string} command The command to execute.
     */
    async handleInteraction(interaction, command) {
        return;
    }

    /**
     * Set the message ID.
     * @param {string} id The ID of the current Control Panel message.
     * @returns {ControlPanel} The Control Panel.
     */
    setMessageID(id) {
        this.messageID = id;
        return this;
    }

    /**
     * Get the embeds for the message.
     * @returns {MessageEmbed[]}
     */
    getEmbeds() {
        const embed1 = new MessageEmbed()
            .setTitle(this.title)
            .setDescription('Empty Control Panel')
            .setColor('RED');
        return [embed1];
    }

    /**
     * Get the components for the message.
     * @returns {MessageActionRow[]}
     */
    getComponents() {
        const refreshActionRow = new MessageActionRow()
            .addComponents(
                new MessageButton(),
            )
        return [];
    }
}

module.exports = {
    ControlPanel,
}