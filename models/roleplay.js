// roleplay.js
const { Guild, GuildMember, Message, MessageEmbed, TextChannel, MessageActionRow, MessageButton, Collection, MessageSelectMenu } = require('discord.js');
const download = require('download')
const fs = require('fs')

const wait = require('util').promisify(setTimeout);

const { Character } = require('./character');
const { Player } = require('./player');
const { Roleplay: RDB, RoleplayPost } = require('./database');

class Roleplay {
    static DOWNLOAD_PATH = `../downloads/`;
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
            category: this.category?.id,
            characters: Array.from(this.characters.keys()),
            act: this.act,
            chapter: this.chapter,
            round: this.round,
            turnOrder: this.turnOrder,
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
            .setDescription(`${this.description}\nAct: ${this.act}\nChapter: ${this.chapter}\nRound: ${this.round}`);
        const actionRow = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId(`rp.${this.id}:post`)
                    .setLabel('Post')
                    .setStyle('PRIMARY')
            );
        const message = await channel.send({ embeds: [embed], components: [actionRow] });
        this.settings.controlMessage = message.id;
        this.save();
        return message;
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
        const ids = characters.map(c => c.getUserId());
        await Promise.all(ids);
        return ids;
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
     * @returns {Promise<Array<boolean, string>>} The results of the post.
     */
    async post(messages, character) {
        let content = '';
        if (messages[0].attachments.size > 0 && messages[0].attachments.first().name.endsWith('.txt')) {
            const url = messages[0].attachments.first().url;
            try {
                await download(url, Roleplay.DOWNLOAD_PATH, { filename: `${this.id}_tmp.txt` })
            } catch (e) {
                console.error(e);
                return [false, 'Failed to download file.'];
            }
            const file = Roleplay.DOWNLOAD_PATH + `${this.id}_tmp.txt`;
            content = fs.readFileSync(file, 'utf8');
        } else {
            content = messages.map(m => m.content).join('\n');
        }
        const parsed = this.parseContent(content);
        const channel = this.getMainChannel();
        const player = await Player.getByCharacter(channel.guild, character)
        const embed = new MessageEmbed()
            .setColor(character.color)
            .setAuthor({ name: character.name, iconURL: player?.member.displayAvatarURL()})
            .setDescription(parsed)
            .setFooter({ text: `${this.act}-${this.chapter}-${this.round}`});
        await channel.send(embed);
        await this.createPostEntry(character, content);
        const canPostIds = await this.getWhosTurn();
        if (canPostIds.includes(player.member.id)) {
            this.posted(character);
        }
        return [true, 'Message Posted.'];
    }

    async createPostEntry(content, character) {
        const entry = await this.entry.createPost({
            content: content,
            round: this.round,
            chapter: this.chapter,
            act: this.act,
        });
        await entry.addCharacter(character.entry);
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
                    value: character.id,
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
            .setDescription(`Please select what character you would like to post as. Current Turn: ${this.currentTurnOrder[0].map(c => c.name).join(', ')}`)
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
                character = await Character.get(response.values[0]);
                embed.setDescription(`You have selected ${character.name} to post as.`);
                await response.update({ embeds: [embed] });
                await wait(1000);
                await message.delete();
            } catch (e) {
                embed.setTitle('Timed out.');
                embed.setDescription('You did not select a character in time.');
                embed.setColor('RED');
                await message.edit({ embeds: [embed], components: [] });
                return;
            }
        } else if (options.length === 1) {
            // If there is only one character, use that character.
            character = player.characters.get(options[0].value);
            embed.setDescription(`You are posting as ${character.name}.`);
            embed.setColor(character.color);
        } else {
            // No characters to post as.
            embed.setTitle('No characters.');
            embed.setDescription('You do not have any characters to post as.');
            embed.setColor('RED');
            message = await player.member.send({ embeds: [embed], components: [] });
            return;
        }
        embed.setDescription(`${embed.description}\nPlease enter as many messages as needed to post or upload a txt file. Reply with \`done\` when finished or \`cancel\` to cancel. Uploading a txt file will finish the post immediately.`);
        if (!this.currentTurnOrder[0].includes(character)) {
            embed.setDescription(`${embed.description}\nWARNING: IT IS NOT CURRENTLY YOUR TURN IN THE ROLEPLAY.`);
        }
        message = /** @type {Message} */ (await player.member.send({ embeds: [embed], components: [] }));
        let repeat = true;
        const messages = new Array();
        while (repeat) {
            const response = await message.awaitMessages({ max: 1, time: 600000 });
            if (response.content.lowerCase() === 'done') {
                repeat = false;
            } else if (response.content.lowerCase() === 'cancel') {
                await message.delete();
                return;
            } else if (response.attachments.size > 0 && response.attachments.first().name.endsWith('.txt')) {
                messages.push(response);
                repeat = false;
            } else {
                messages.push(response);
            }
        }
        embed.setDescription('Posting...');
        await message.edit({ embeds: [embed], components: [] });
        await this.post(messages, character);
    }

    async handleInteraction(interaction) {

    }

    /**
     * Move the roleplay along as if this character has posted.
     * @param {Character} character The character that posted.
     */
    posted(character) {
        const currentTurn = this.currentTurnOrder[0];
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
     * @returns {string} The parsed content.
     */
    parseContent(content) {
        // TODO: Parse content and look for InformationPosts.
        return content;
    }
}

module.exports = {
    Roleplay,
};