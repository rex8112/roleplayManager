// player.js

const { Guild, GuildMember } = require('discord.js');

const { Player: PDB } = require('./database');

class Player {
    /**
     * 
     * @param {Guild} guild 
     */
    constructor(guild) {
        this.guild = guild;
        this.id = 0;
        this.member = null;
        this.characters = new Array();
        this.category = null;
    }

    // Static Methods

    /**
     * Create a new player and save it to the database.
     * @param {Guild} guild Guild to create the player in.
     * @param {GuildMember} member The member to create the player for.
     * @returns {Promise<Player>} The player object.
     */
    static async new(guild, member) {
        const player = new Player(guild);
        player.member = member;
        player.category = await guild.channels.create(member.displayName, { type: 'GUILD_CATEGORY' });
        const data = this.toJSON();
        delete data.id;
        const entry = await PDB.create(data)
        player.id = entry.id;
        return player;
    }

    /**
     * Get the player from the database.
     * @param {Guild} guild The guild to get the player from.
     * @param {number} id The id of the player to get.
     * @returns {Promise<Player>} The player object.
     */
    static async get(guild, id) {
        const entry = await PDB.findOne({ where: { id, guild: guild.id } });
        if (!entry) return null;
        const player = new Player(guild);
        player.id = entry.id;
        player.member = guild.members.resolve(entry.member);
        if (!player.member) player.member = await guild.members.fetch(entry.member);
        player.characters = entry.characters;
        player.category = guild.channels.resolve(entry.category);
        if (!player.category) player.category = await guild.channels.fetch(entry.category);
        return player;
    }

    // Instance Methods
    /**
     * Save the player to the database.
     */
    async save() {
        const data = this.toJSON();
        delete data.id;
        await PDB.update(data, { where: { id: this.id } });
    }

    /**
     * Returns the JSON object of the player.
     * @returns {Object} The JSON object of the player.
     */
    toJSON() {
        return {
            id: this.id,
            guild: this.guild.id,
            member: this.member.id,
            characters: this.characters,
            category: this.category.id,
        }
    }
}