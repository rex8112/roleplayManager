const fs = require('fs');
const { Client, Collection, Intents } = require('discord.js');
const { token } = require('./config.json');

const client = new Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_MEMBERS
    ]
})

client.commands = new Collection();
client.contexts = new Collection();
client.roleplays = new Collection();

const commandsFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
const contextFiles = fs.readdirSync('./contexts').filter(file => file.endsWith('.js'));
const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args))
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

for (const file of commandsFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
}

for (const file of contextFiles) {
    const context = require(`./contexts/${file}`);
    client.contexts.set(context.data.name, context);
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand() && !interaction.isContext()) return;

    let command;
    if (interaction.isCommand()) {
        command = client.commands.get(interaction.commandName);
    } else {
        command = client.contexts.get(interaction.commandName)
    }

    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        const content = `An error occured while executing this command\n\`\`\`js\n${error.stack}\`\`\``;
        if (interaction.deferred) {
            interaction.editReply({ content: content, ephemeral: true });
        } else if (interaction.replied) {
            interaction.followUp({ content: content, ephemeral: true });
        } else {
            interaction.reply({ content: content, ephemeral: true });
        }
    }
})

client.login(token);