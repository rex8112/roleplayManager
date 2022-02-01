const { sequelize } = require('../models/database.js');

const { Roleplay } = require('../models/roleplay');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        await sequelize.sync();
        console.log(`Ready! Logged in as ${client.user.tag}`);
        for (const guild of client.guilds.cache.values()) {
            const roleplays = await Roleplay.getAllInGuild(guild);
            for (const roleplay of roleplays) {
                client.roleplays.set(roleplay.id, roleplay);
            }
        }
        console.log(`Loaded ${client.roleplays.size} roleplays.`);
    },
};