// roleplay.js
const { Guild, GuildMember, Message, MessageEmbed, TextChannel, User } = require('discord.js');
const download = require('download')
const fs = require('fs')

const { Character } = require('./character');
const { Roleplay: RDB } = require('./database');

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
        const data = this.toJSON();
        delete data.id;
        const entry = await RDB.create(data)
        roleplay.id = entry.id;
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
     * @param {Object} data The data to create the roleplay from.
     * @returns {Promise<Roleplay>} The roleplay object.
     */
    static async fromJSON(guild, data) {
        const roleplay = new Roleplay(guild);
        roleplay.id = data.id;
        roleplay.name = data.name;
        roleplay.description = data.description;
        roleplay.gm = guild.members.resolve(data.gm);
        roleplay.category = guild.channels.resolve(data.category);
        roleplay.characters = new Collection();
        for (const id of data.characters) {
            const character = await Character.get(id);
            roleplay.characters.set(id, character);
        }
        roleplay.act = data.act;
        roleplay.chapter = data.chapter;
        roleplay.round = data.round;
        roleplay.turnOrder = data.turnOrder;
        roleplay.turn = data.turn;
        roleplay.turnDuration = data.turnDuration;
        roleplay.turnTime = data.turnTime;
        roleplay.settings = data.settings;
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
     * Get the users that can currently post in the roleplay.
     * @returns {Array<GuildMember>} The the users who's turn it is.
     */
    getWhosTurn() {
        characters = this.guild.members.resolve(this.currentTurnOrder[0]);
        return characters.map(c => c.user);
    }

    /**
     * 
     * @returns {TextChannel} The channel that the roleplay is in.
     */
    getMainChannel() {
        return this.category.children.find(c => c.name === 'main');
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
        const embed = new MessageEmbed()
        .setColor(character.color)
        .setAuthor({ name: character.name, iconURL: character.user.displayAvatarURL()})
        .setDescription(parsed)
        .setFooter({ text: `${this.act}-${this.chapter}-${this.round}`});
        await channel.send(embed);
        if (character.user.id in this.getWhosTurn().map(u => u.id)) {
            this.posted(character);
        }
        return [true, 'Message Posted.'];
    }

    /**
     * Move the roleplay along as if this character has posted.
     * @param {Character} character The character that posted.
     */
    posted(character) {
        const currentTurn = this.currentTurnOrder[0];
        if (character in currentTurn) {
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
        if (this.turnDuration)
            const date = new Date(Date.now() + this.turnDuration);
        else
            const date = null;
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