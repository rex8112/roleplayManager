// roleplay.js
const { Guild, GuildMember, Message, MessageEmbed, TextChannel, MessageActionRow, MessageButton, Collection, MessageSelectMenu, ButtonInteraction } = require('discord.js');
const download = require('download')
const fs = require('fs')

const wait = require('util').promisify(setTimeout);

const { Character } = require('./character');
const { Player } = require('./player');
const { Roleplay: RDB, RoleplayPost, Headers } = require('./database');

class Roleplay {
    static DOWNLOAD_PATH = `./downloads/`;
    /**
     * 
     * @param {Guild} guild 
     */
    constructor(guild) {
        this.guild = guild;
        this.id = 0;
        this.name = '';
        this.description = '';
        this.characters = new Collection();
        this.gm = null;
        this.category = null;
        this.entry = null;

        this.act = 1;
        this.chapter = 1;
        this.round = 1;

        this.turnOrder = [];
        this.turn = 0;
        this.currentTurnOrder = [];
        this.turnDuration = null;
        this.turnTime = null;
        this.settings = {
            defaultDie: 20,
            controlMessage: null
        }
    }

    // Static Methods
    /**
     * Create a new roleplay.
     * @param {Guild} guild The guild to create the roleplay in.
     * @param {string} name The name of the roleplay.
     * @param {GuildMember} gm The game master of the roleplay.
     * @returns {Promise<Roleplay>} The roleplay object.
     */
    static async new(guild, name, gm) {
        const roleplay = new Roleplay(guild);
        roleplay.name = name;
        roleplay.gm = gm;
        roleplay.category = await guild.channels.create(name, { type: 'GUILD_CATEGORY' });
        await roleplay.category.createChannel('main');
        await roleplay.category.createChannel('information');
        await roleplay.category.createChannel('characters');
        await roleplay.category.createChannel('rolls');
        await roleplay.category.createChannel('discussion');
        const data = roleplay.toJSON();
        delete data.id;
        const entry = await RDB.create(data)
        roleplay.id = entry.id;
        roleplay.entry = entry;

        await roleplay.refreshControlMessage();
        return roleplay;
    }

    /**
     * Get a roleplay from the database.
     * @param {Guild} guild The guild the roleplay is in.
     * @param {number} id The id of the roleplay.
     * @returns {Promise<Roleplay>} The roleplay object.
     */
    static async get(guild, id) {
        const entry = await RDB.findOne({ where: { id, guild: guild.id } });
        if (!entry) return null;
        const roleplay = Roleplay.fromJSON(guild, entry);
        return roleplay;
    }

    /**
     * Get all the roleplays in the guild.
     * @param {Guild} guild The guild to get the roleplays from.
     * @returns {Promise<Roleplay[]>} The roleplays in the guild.
     */
    static async getAllInGuild(guild) {
        const entries = await RDB.findAll({ where: { guild: guild.id } });
        const roleplayPromises = entries.map(e => Roleplay.fromJSON(guild, e));
        const roleplays = await Promise.all(roleplayPromises);
        return roleplays;
    }

    /**
     * Build a roleplay from a JSON object.
     * @param {Guild} guild The guild the roleplay is in.
     * @param {Object} json The data to create the roleplay from.
     * @returns {Promise<Roleplay>} The roleplay object.
     */
    static async fromJSON(guild, json) {
        const roleplay = new Roleplay(guild);
        roleplay.id = json.id;
        roleplay.name = json.name;
        roleplay.description = json.description;
        roleplay.gm = guild.members.resolve(json.gm);
        roleplay.guild = guild;
        roleplay.entry = json;
        roleplay.category = guild.channels.resolve(json.category);
        roleplay.characters = new Collection();
        for (const id of json.characters) {
            const character = await Character.get(id);
            roleplay.characters.set(id, character);
        }
        roleplay.act = json.act;
        roleplay.chapter = json.chapter;
        roleplay.round = json.round;
        roleplay.turnOrder = json.turnOrder;
        roleplay.currentTurnOrder = json.currentTurnOrder;
        roleplay.turn = json.turn;
        roleplay.turnDuration = json.turnDuration;
        roleplay.turnTime = json.turnTime;
        roleplay.settings = json.settings;
        return roleplay;
    }

    // Instance Methods
    /**
     * Returns the roleplay as a JSON object.
     * @returns {Object} The JSON object of the roleplay.
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            gm: this.gm?.id,
            guild: this.guild.id,
            category: this.category?.id,
            characters: Array.from(this.characters.keys()),
            act: this.act,
            chapter: this.chapter,
            round: this.round,
            turnOrder: this.turnOrder,
            currentTurnOrder: this.currentTurnOrder,
            turn: this.turn,
            turnDuration: this.turnDuration,
            turnTime: this.turnTime,
            settings: this.settings,
        }
    }

    async save() {
        const data = this.toJSON();
        await RDB.update(data, { where: { id: this.id } });
    }

    /**
     * Refresh the control panel.
     * @returns {Promise<Message>} The message for the roleplay controls.
     */
    async refreshControlMessage() {
        const channel = this.getInformationChannel();
        if (this.settings.controlMessage) {
            const oldMessage = await channel.messages.fetch(this.settings.controlMessage)
            if (oldMessage) await oldMessage.delete();
        }
        const embed = new MessageEmbed()
            .setTitle(`${this.name} Control Panel`)
            .setDescription(`${this.description}\n\nCurrent Turn: ${this.currentTurnOrder[0].map(m => this.characters.get(m)?.name).join(', ')}\n\nAct: ${this.act}\nChapter: ${this.chapter}\nRound: ${this.round}`);
        const actionRow = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId(`rp.${this.id}:post`)
                    .setLabel('Post')
                    .setStyle('PRIMARY'),
                new MessageButton()
                    .setCustomId(`rp.${this.id}:character`)
                    .setLabel('Create Character')
                    .setStyle('SUCCESS'),
            );
        const actionRow2 = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId(`rp.${this.id}:refresh`)
                    .setLabel('Refresh')
                    .setStyle('SECONDARY'),
            );
        const message = await channel.send({ embeds: [embed], components: [actionRow, actionRow2] });
        this.settings.controlMessage = message.id;
        this.save();
        return message;
    }

    /**
     * Set the turn order. Resets the current round.
     * @param {Array<string[]>} turnOrder 2D Array of character ids.
     */
    setTurnOrder(turnOrder) {
        this.turnOrder = turnOrder;
        this.currentTurnOrder = turnOrder.slice();
        this.save();
        this.refreshControlMessage();
    }

    async incrementChapter(title) {
        this.chapter++;
        this.round = 1;
        const chapterTitle = title ? `: ${title}` : '';
        const embed = new MessageEmbed()
            .setTitle(`${this.name} Chapter ${this.chapter}${chapterTitle}`)
            .setColor('GREEN');
        const channel = this.getMainChannel();
        const message = await channel.send({ embeds: [embed] });
        await this.createHeaderEntry(title, this.act, this.chapter, message);
    }
    
    async incrementAct(title) {
        this.act++;
        this.chapter = 1;
        this.round = 1;
        const actTitle = title ? `: ${title}` : '';
        const embed = new MessageEmbed()
            .setTitle(`${this.name} Act ${this.act}${actTitle}`)
            .setColor('GREEN');
        const channel = this.getMainChannel();
        const message = await channel.send({ embeds: [embed] });
        await this.createHeaderEntry(title, this.act, this.chapter, message);
    }

    /**
     * Returns a collection of all players in the roleplay.
     * @returns {Collection<string, GuildMember>} The players in the roleplay.
     */
    getPlayers() {
        const players = new Collection();
        for (const character of this.characters.values()) {
            if (character.user) players.set(character.user.id, this.guild.members.resolve(character.user));
        }
        return players;
    }

    /**
     * Get the userIDs that can currently post in the roleplay.
     * @returns {Promise<Array<string>>} The the users who's turn it is.
     */
    async getWhosTurn() {
        const characters = /** @type {Array<Character>} */ (this.currentTurnOrder[0]);
        const ids = characters?.map(c => c.getUserId());
        if (ids) await Promise.all(ids);
        return ids ?? [];
    }

    /**
     * 
     * @returns {TextChannel} The channel that the roleplay is in.
     */
    getMainChannel() {
        return this.category.children.find(c => c.name === 'main');
    }
    
    /**
     * 
     * @returns {TextChannel} The channel that the roleplay information is in.
     */
    getInformationChannel() {
        return this.category.children.find(c => c.name === 'information');
    }

    /**
     * Post a message in the roleplay.
     * @param {Array<Message>} messages The messages to post.
     * @param {Character} character The character to post as.
     * @returns {Promise<Message[]>} The messages posted.
     */
    async post(messages, character) {
        let content = '';
        if (messages[0].attachments.size > 0 && messages[0].attachments.first().name.endsWith('.txt')) {
            const url = messages[0].attachments.first().url;
            try {
                await download(url, Roleplay.DOWNLOAD_PATH, { filename: `${this.id}_tmp.txt` })
            } catch (e) {
                console.error(e);
                return [];
            }
            const file = Roleplay.DOWNLOAD_PATH + `${this.id}_tmp.txt`;
            content = fs.readFileSync(file, 'utf8');
            //fs.rm(file);
        } else {
            content = messages.map(m => m.content).join('\n');
        }
        const parsed = this.parseContent(content);
        const channel = this.getMainChannel();
        const player = await Player.getByCharacter(channel.guild, character)
        const posts = new Array();
        for (const [i, message] of parsed.entries()) {
            const embed = new MessageEmbed()
                .setColor(character.color)
                .setAuthor({ name: character.name, iconURL: player?.member.displayAvatarURL()})
                .setDescription(message)
                .setFooter({ text: `Act: ${this.act}, Chapter: ${this.chapter}, Round: ${this.round}`});
            if (parsed.length > 1) embed.setTitle(`Post ${i + 1}/${parsed.length}`);
            const post = await channel.send({ embeds: [embed] });
            posts.push(post);
        }
        await this.createPostEntry(content, character, posts);

        this.posted(character);
        return posts;
    }

    /**
     * Create a database entry for a post.
     * @param {string} content The content, pre-parsed.
     * @param {Character} character The character who posted.
     * @param {Message[]} posts The messages that were posted.
     */
    async createPostEntry(content, character, posts) {
        const ids = posts.map(p => p.id);
        const entry = await this.entry.createPost({
            content: content,
            messages: JSON.stringify(ids),
            round: this.round,
            chapter: this.chapter,
            act: this.act,
        });
        await entry.setCharacter(character.entry);
        return entry;
    }
    
    /**
     * Create a header entry for a table of contents later.
     * @param {string} title The title of the header.
     * @param {number} act The act of the header.
     * @param {number} chapter The chapter of the header.
     * @param {Message} message The message that was posted.
     */
    async createHeaderEntry(title, act, chapter, message) {
        const entry = await this.entry.createHeader({
            title: title,
            act: act,
            chapter: chapter,
            messageLink: message?.url,
        })
        return entry;
    }

    /**
     * Wait for the messages to be collected and post them.
     * @param {Player} player The player who is going to post.
     */
    async waitForPost(player) {
        const options = new Array();
        for (const character of player.characters.values()) {
            if (this.characters.has(character.id)) {
                options.push({
                    label: character.name,
                    description: `Choose ${character.name} to post.`,
                    value: `${character.id}`,
                });
            }
        }
        const selectActionRow = new MessageActionRow()
            .addComponents(
                new MessageSelectMenu()
                    .setCustomId(`rp.${this.id}:selectCharacter`)
                    .setPlaceholder('Select a character to post.')
                    .addOptions(options));
        const embed = new MessageEmbed()
            .setTitle(`Posting in ${this.name}`)
            .setDescription(`Please select what character you would like to post as. Current Turn: ${this.currentTurnOrder[0]?.map(c => c.name).join(', ')}`)
            .setColor('ORANGE');
        /** @type {Message} */
        let message;
        /** @type {Character} */
        let character;

        if (options.length > 1) {
            // If there is more than one character, show the select menu.
            message = await player.member.send({ embeds: [embed], components: [selectActionRow] });
            try{
                const response = await message.awaitMessageComponent({ componentType: 'SELECT_MENU', time: 60000 })
                character = await Character.get(parseInt(response.values[0]));
                embed.setDescription(`You have selected ${character.name} to post as.`);
                await response.update({ embeds: [embed] });
                await wait(1000);
                await message.delete();
            } catch (e) {
                embed.setTitle('Timed out.');
                embed.setDescription('You did not select a character in time.');
                embed.setColor('RED');
                await message.edit({ embeds: [embed], components: [] });
                return false;
            }
        } else if (options.length === 1) {
            // If there is only one character, use that character.
            character = player.characters.get(parseInt(options[0].value));
            embed.setDescription(`You are posting as ${character.name}.`);
            embed.setColor(character.color);
        } else {
            // No characters to post as.
            embed.setTitle('No characters.');
            embed.setDescription('You do not have any characters to post as.');
            embed.setColor('RED');
            message = await player.member.send({ embeds: [embed], components: [] });
            return false;
        }
        embed.setDescription(`${embed.description}\nPlease enter as many messages as needed to post or upload a txt file. Reply with \`done\` when finished or \`cancel\` to cancel. Uploading a txt file will finish the post immediately.`);
        if (!this.currentTurnOrder[0]?.includes(character)) {
            embed.setDescription(`${embed.description}\n\nWARNING: IT IS NOT CURRENTLY YOUR TURN IN THE ROLEPLAY.`);
        }
        message = /** @type {Message} */ (await player.member.send({ embeds: [embed], components: [] }));
        let repeat = true;
        const messages = new Array();
        while (repeat) {
            const responses = await message.channel.awaitMessages({ max: 1, time: 600_000 });
            const responseMessage = responses.first();
            if (responseMessage.content.toLowerCase() === 'done') {
                repeat = false;
            } else if (responseMessage.content.toLowerCase() === 'cancel') {
                await message.delete();
                return false;
            } else if (responseMessage.attachments.size > 0 && responseMessage.attachments.first().name.endsWith('.txt')) {
                messages.push(responseMessage);
                repeat = false;
            } else {
                messages.push(responseMessage);
            }
        }
        embed.setDescription('Posting...');
        await message.edit({ embeds: [embed], components: [] });
        const postedMessages = await this.post(messages, character);
        // Create a goto hyperlink.
        if (postedMessages.length > 0) {
            embed.setDescription('Posted!');
            embed.setColor('GREEN');
            const row = new MessageActionRow()
                .addComponents(
                    new MessageButton()
                        .setLabel('Goto')
                        .setURL(postedMessages[0].url));
            await message.edit({ embeds: [embed], components: [row] });
        }
        return true;
    }

    /**
     * Handle any button interactions related to the roleplay.
     * @param {ButtonInteraction} interaction The button interaction.
     */
    async handleButtonInteraction(interaction, command) {
        if (!interaction.deferred) await interaction.deferReply({ ephemeral: true });

        if (command === 'post') {
            const player = await Player.getByMemberId(interaction.guild, interaction.user.id);
            if (player) {
                await interaction.editReply({ content: 'Please check your DMs to post.' });
                const result = await this.waitForPost(player);
                return result
            }
            await interaction.editReply({ content: 'You are not registered.' });
            return false;
        } else if (command === 'character') {

        } else if (command === 'refresh') {
            await this.refresh();
            await interaction.editReply({ content: 'Refreshed.' });
            return true;
        }
    }

    /**
     * Move the roleplay along as if this character has posted.
     * @param {Character} character The character that posted.
     */
    posted(character) {
        const currentTurn = this.currentTurnOrder[0];
        if (!currentTurn) return;
        if (currentTurn.includes(character)) {
            const index = currentTurn.indexOf(character);
            currentTurn.splice(index, 1);
        }
        if (currentTurn.length === 0) {
            this.currentTurnOrder.shift();
        }
        if (this.currentTurnOrder.length === 0) {
            this.newRound();
        }
        this.calculateTurnTime();
    }

    /**
     * Generate a new round.
     */
    newRound() {
        this.round++;
        this.currentTurnOrder = this.turnOrder.slice();
    }

    /**
     * Calculate the exact date and time the next turn has to occur by.
     */
    calculateTurnTime() {
        if (this.turnDuration) {
            const date = new Date(Date.now() + this.turnDuration);
        } else {
            const date = null;
        }
        this.turnTime = date;
    }

    /**
     * Parse content and look to see if there are any hyperlinks in it.
     * @param {string} content The content to parse.
     * @returns {string[]} The parsed content.
     */
    parseContent(content) {
        // TODO: Parse content and look for InformationPosts.

        // Split the content into smaller chunks that can fit in a discord embed.
        const chunks = new Array();
        let remaining = content;
        while (remaining.length > 4096) {
            const lastSpace = remaining.lastIndexOf(' ', 4095);
            chunks.push(remaining.substring(0, lastSpace));
            remaining = remaining.substring(lastSpace);
        } 
        if (remaining.length > 0) {
            chunks.push(remaining);
        }
        return chunks;
    }
}

module.exports = {
    Roleplay,
};