// player.js

const { Guild, GuildMember, Collection } = require('discord.js');

const { Player: PDB } = require('./database');
const { Character } = require('./character');

class Player {
    /**
     * 
     * @param {Guild} guild 
     */
    constructor(guild) {
        this.guild = guild;
        this.id = 0;
        this.entry = null;
        this.member = null;
        this.characters = new Collection();
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
        const data = player.toJSON();
        delete data.id;
        const entry = await PDB.create(data)
        player.id = entry.id;
        player.entry = entry;
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
        const player = new Player.fromJSON(guild, entry);
        return player;
    }

    /**
     * Get the player with the given member id.
     * @param {string} memberId The id of the member to get.
     * @returns {Promise<Player>} The player object.
     */
    static async getByMemberId(guild, memberId) {
        const entry = await PDB.findOne({ where: { member: memberId } });
        if (!entry) return null;
        const player = await Player.fromJSON(guild, entry);
        return player;
    }

    /**
     * Builds a player from a JSON object.
     * @param {Guild} guild The guild of the player.
     * @param {Object} json The JSON object of the player.
     * @returns {Promise<Player>} The player object.
     */
    static async fromJSON(guild, json) {
        const player = new Player(guild);
        player.id = json.id;
        player.member = guild.members.resolve(json.member);
        if (!player.member) player.member = await guild.members.fetch(json.member);
        const characters = await json.getCharacters();
        for (const cEntry of characters) {
            const character = await Character.fromJSON(cEntry);
            player.characters.set(character.id, character);
        }
        player.category = guild.channels.resolve(json.category);
        player.entry = json;
        if (!player.category) player.category = await guild.channels.fetch(json.category);
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
     * Add a character to the player.
     * @param {Character} character The character to add to the player.
     */
    async addCharacter(character) {
        character.playerId = this.id;
        this.characters.set(character.id, character);
        await this.entry.addCharacters(character.entry);
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
            characters: this.characters.map(c => c.id),
            category: this.category.id,
        }
    }
}

module.exports = {
    Player,
}