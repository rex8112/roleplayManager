// player.js

class Player {
    constructor(guild) {
        this.guild = guild;
        this.id = 0;
        this.member = null;
        this.characters = new Array();
        this.category = null;
    }

    // Static Methods
    static async new(guild, member) {
        const player = new Player(guild);
        player.member = member;
        player.category = await guild.channels.create(member.displayName, { type: 'GUILD_CATEGORY' });
        const entry = await PDB.create() // TODO: Create player in database
        player.id = entry.id;
        return player;
    }
}