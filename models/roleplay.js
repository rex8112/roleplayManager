// roleplay.js
// const { Roleplay } = require('./database');

const { Guild, GuildMember, User } = require('discord.js');

class Roleplay {
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
        this.turnDuration = null;
        this.turnTime = null;
    }

    // Static Methods
    /**
     * 
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
        const entry = await RDB.create() // TODO: Create roleplay in database
        roleplay.id = entry.id;
        return roleplay;
    }

    // Instance Methods
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            gm: this.gm?.id,
            characters: Array.from(this.characters.keys()),
            act: this.act,
            chapter: this.chapter,
            round: this.round,
            turnOrder: this.turnOrder,
            turn: this.turn,
            turnDuration: this.turnDuration,
            turnTime: this.turnTime
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
}

module.exports = {
    Roleplay,
};