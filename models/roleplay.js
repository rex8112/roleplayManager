// roleplay.js
const { Guild, GuildMember, Message, MessageEmbed, TextChannel, MessageActionRow, MessageButton, Collection, MessageSelectMenu, ButtonInteraction } = require('discord.js');
const download = require('download')
const fs = require('fs')

const wait = require('util').promisify(setTimeout);

const { Character } = require('./character');
const { Player } = require('./player');
const { Roleplay: RDB, RoleplayPost, Headers } = require('./database');
const { CharacterControl } = require('./characterControl');

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
        this.controlPanels = new Collection();
        this.gm = null;
        this.category = null;
        this.entry = null;

        this.act = 0;
        this.chapter = 0;
        this.round = 0;
        this.busy = false;

        this.turnOrder = [];
        this.turn = 0;
        this.currentTurnOrder = [];
        this.turnDuration = null;
        this.turnTime = null;
        this.showUndo = false;
        this.settings = {
            defaultDie: 20,
            controlMessage: null,
            characterControlMessage: null,
            gmMessage: null,
            gmCharacter: null,
            color: '#ffffff',
        }
    }

    // Static Methods
    /**
     * Create a new roleplay.
     * @param {Guild} guild The guild to create the roleplay in.
     * @param {string} name The name of the roleplay.
     * @param {string} color Hex color code of the roleplay.
     * @param {GuildMember} gm The game master of the roleplay.
     * @returns {Promise<Roleplay>} The roleplay object.
     */
    static async new(guild, name, color, gm) {
        const permissionOverwrites = [
            {
                id: gm.id,
                allow: ['VIEW_CHANNEL'],
                type: 'member',
            },
            {
                id: guild.me.id,
                allow: ['VIEW_CHANNEL'],
                type: 'member',
            },
            {
                id: guild.roles.everyone.id,
                deny: ['VIEW_CHANNEL'],
                type: 'role',
            }
        ];
        const mainPermissionOverwrites = [
            {
                id: guild.me.id,
                allow: ['SEND_MESSAGES'],
                type: 'member',
            },
            {
                id: guild.roles.everyone.id,
                deny: ['SEND_MESSAGES'],
                type: 'role',
            }
        ];
        const roleplay = new Roleplay(guild);
        roleplay.name = name;
        roleplay.gm = gm;
        roleplay.category = await guild.channels.create(name, { type: 'GUILD_CATEGORY' });
        await roleplay.category.createChannel('main', { permissionOverwrites: mainPermissionOverwrites });
        await roleplay.category.createChannel('information', { permissionOverwrites: mainPermissionOverwrites });
        await roleplay.category.createChannel('characters', { permissionOverwrites: mainPermissionOverwrites });
        await roleplay.category.createChannel('gm', { permissionOverwrites });
        await roleplay.category.createChannel('rolls');
        await roleplay.category.createChannel('discussion');
        const data = roleplay.toJSON();
        delete data.id;
        const entry = await RDB.create(data)
        roleplay.id = entry.id;
        roleplay.entry = entry;
        roleplay.settings.color = color;

        let gmPlayer = await Player.getByMemberId(guild, gm.id);
        if (!gmPlayer) gmPlayer = await Player.new(guild, gm);
        const gmCharacter = await Character.new('GM');
        gmCharacter.color = roleplay.settings.color;
        gmPlayer.addCharacter(gmCharacter);
        roleplay.addCharacter(gmCharacter);
        gmCharacter.save();
        roleplay.settings.gmCharacter = gmCharacter.id;

        await roleplay.refreshControlMessage();
        await roleplay.refreshCharacterControlMessage();
        await roleplay.refreshGMControlMessage();
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
        roleplay.gm = await guild.members.fetch(json.gm);
        roleplay.guild = guild;
        roleplay.entry = json;
        roleplay.category = await guild.channels.fetch(json.category);
        roleplay.characters = new Collection();
        for (const id of json.characters) {
            const character = await Character.get(id);
            roleplay.characters.set(id, character);
            if (character.id !== json.settings.gmCharacter) new CharacterControl(roleplay, character);
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
        await roleplay.refreshControlMessage();
        await roleplay.refreshCharacterControlMessage();
        await roleplay.refreshGMControlMessage();
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
        const channel = this.getMainChannel();
        if (this.settings.controlMessage) {
            let oldMessage;
            try {
                oldMessage = await channel.messages.fetch(this.settings.controlMessage)
            } catch (e) {}
            if (oldMessage) await oldMessage.delete();
        }
        let mentions = '';
        const ids = await this.getWhosTurn();
        for (const id of ids) {
            mentions += `<@${id}> `;
        }
        const currentTurnString = this.getCurrentTurn()?.map(m => this.characters.get(m)?.name).join(', ') || this.getGMCharacter().name;
        const embed = new MessageEmbed()
            .setTitle(`${this.name} Control Panel`)
            .setDescription(`${this.description}\n\nCurrent Turn: ${currentTurnString}\n${mentions}\n\nAct: ${this.act}\nChapter: ${this.chapter}\nRound: ${this.round}`)
            .setColor(this.settings.color);
        const actionRow = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId(`rp.${this.id}:post`)
                    .setLabel('Post')
                    .setStyle('PRIMARY'),
                new MessageButton()
                    .setCustomId(`rp.${this.id}:poke`)
                    .setLabel('Poke')
                    .setStyle('SUCCESS'),
            );
        const message = await channel.send({ embeds: [embed], components: [actionRow] });
        this.settings.controlMessage = message.id;
        await this.save();
        return message;
    }

    async refreshCharacterControlMessage() {
        const channel = this.getCharacterChannel();
        if (this.settings.characterControlMessage) {
            let oldMessage;
            try {
                oldMessage = await channel.messages.fetch(this.settings.characterControlMessage)
            } catch (e) {}
            if (oldMessage) await oldMessage.delete();
        }
        const embed = new MessageEmbed()
            .setTitle(`Character Control Panel`)
            .setDescription('More will be added to this but I wanted to get the create character button away from post.')
            .setColor(this.settings.color);
        const actionRow = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId(`rp.${this.id}:character`)
                    .setLabel('Create Character')
                    .setStyle('SUCCESS'),
            );
        const message = await channel.send({ embeds: [embed], components: [actionRow] });
        this.settings.characterControlMessage = message.id;
        await this.save();
        return message;
    }

    async refreshGMControlMessage(edit = false) {
        const channel = this.getGMChannel();
        let needNew = false;

        const characterString = this.characters.map(c => `${c.id}: ${c.name}`).join('\n');
        const embed = new MessageEmbed()
            .setTitle(`${this.name} Control Panel`)
            .addField('Characters', characterString ?? '', true)
            .addField('Turn Order', JSON.stringify(this.turnOrder), true)
            .addField('Current Turn Order', JSON.stringify(this.currentTurnOrder), true)
            .setColor(this.settings.color);
        const actionRow = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId(`rp.${this.id}:gmpost`)
                    .setLabel('GM Post')
                    .setStyle('PRIMARY'),
                new MessageButton()
                    .setCustomId(`rp.${this.id}:incrementAct`)
                    .setLabel('New Act')
                    .setStyle('SUCCESS'),
                new MessageButton()
                    .setCustomId(`rp.${this.id}:incrementChapter`)
                    .setLabel('New Chapter')
                    .setStyle('SUCCESS'),
                new MessageButton()
                    .setCustomId(`rp.${this.id}:setturnorder`)
                    .setLabel('Set Turn Order')
                    .setStyle('SECONDARY'),
            );
        const actionRow2 = new MessageActionRow();
        if (this.showUndo) {
            actionRow2.addComponents(
                new MessageButton()
                    .setCustomId(`rp.${this.id}:undo`)
                    .setLabel('Undo')
                    .setStyle('DANGER'),
                new MessageButton()
                    .setCustomId(`rp.${this.id}:undo1`)
                    .setLabel('Undo Append Turn')
                    .setStyle('DANGER'),
                new MessageButton()
                    .setCustomId(`rp.${this.id}:undo2`)
                    .setLabel('Undo Create Turn')
                    .setStyle('DANGER'),
                new MessageButton()
                    .setCustomId(`rp.${this.id}:showUndo`)
                    .setLabel('Hide Undo')
                    .setStyle('SECONDARY'),
            );
        } else {
            actionRow2.addComponents(
                new MessageButton()
                    .setCustomId(`rp.${this.id}:showUndo`)
                    .setLabel('Show Undo')
                    .setStyle('SECONDARY'),
            );
        }
        const actionRow3 = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId(`rp.${this.id}:refresh`)
                    .setLabel('Refresh')
                    .setStyle('SECONDARY'),
                new MessageButton()
                    .setCustomId(`rp.${this.id}:refreshAll`)
                    .setLabel('Refresh All')
                    .setStyle('SECONDARY'),
            );

        let oldMessage;
        if (this.settings.gmMessage) {
            try {
                oldMessage = await channel.messages.fetch(this.settings.gmMessage)
            } catch (e) {}
            if (edit) {
                if (oldMessage) {
                    await oldMessage.edit({ embeds: [embed], components: [actionRow, actionRow2, actionRow3] });
                } else {
                    needNew = true;
                }
            } else {
                if (oldMessage) await oldMessage.delete();
                needNew = true;
            }
        } else {
            needNew = true;
        }
        if (needNew) {
            const message = await channel.send({ embeds: [embed], components: [actionRow, actionRow2, actionRow3] });
            this.settings.gmMessage = message.id;
            await this.save();
            return message;
        }
        return oldMessage;
    }

    /**
     * Add a character to the roleplay.
     * @param {Character} character The character to add.
     */
    async addCharacter(character) {
        this.characters.set(character.id, character);
        new CharacterControl(this, character);
        await this.entry.addCharacters(character.entry);
        await this.save();
    }

    /**
     * Set the turn order. Resets the current round.
     * @param {Array<string[]>} turnOrder 2D Array of character ids.
     */
    setTurnOrder(turnOrder) {
        this.turnOrder = turnOrder;
        this.currentTurnOrder = [];
        this.save();
        this.refreshControlMessage();
    }

    /**
     * Get a turn order from a user/
     * @param {TextChannel} channel The channel to ask in.
     */
    async promptForTurnOrder(channel) {
        const embed = new MessageEmbed()
            .setTitle('Set Turn Order')
            .setDescription('Please enter the turn order in the following format:\n\n`[[1,2,3],[4]]`')
            .setColor(this.settings.color);
        const message = await channel.send({ embeds: [embed] });

        const responses = await channel.awaitMessages({ max: 1, time: 120_000 });
        const response = responses.first();
        if (!response) return null;
        let turnOrder;
        try {
            turnOrder = JSON.parse(response.content);
        } catch (e) {
            return null;
        }
        if (!Array.isArray(turnOrder)) return null;
        if (!turnOrder.every(t => Array.isArray(t))) return null;
        await message.delete();
        responses.map(r => r.delete());
        return turnOrder;
    }

    /**
     * Get the current turn.
     * @returns {number[]} The current turn.
     */
    getCurrentTurn() {
        return this.currentTurnOrder[0];
    }

    /**
     * Get if it is the character's turn.
     * @param {Character} character The character to check.
     * @returns {boolean} If it is the character's turn.
     */
    isTurn(character) {
        if (this.getCurrentTurn()) {
            return this.getCurrentTurn().includes(character.id);
        } else {
            return character.id === this.getGMCharacter().id;
        }
    }

    async incrementChapter(title) {
        this.chapter++;
        this.round = 0;
        const chapterTitle = title ? `: ${title}` : '';
        const embed = new MessageEmbed()
            .setTitle(`${this.name} Chapter ${this.chapter}${chapterTitle}`)
            .setColor(this.settings.color);
        const channel = this.getMainChannel();
        const message = await channel.send({ embeds: [embed] });
        await this.createHeaderEntry(title, this.act, this.chapter, message);
    }
    
    async incrementAct(title) {
        this.act++;
        this.chapter = 0;
        this.round = 0;
        const actTitle = title ? `: ${title}` : '';
        const embed = new MessageEmbed()
            .setTitle(`${this.name} Act ${this.act}${actTitle}`)
            .setColor(this.settings.color);
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
     * @returns {Promise<Array<string>>} The the user ids of who's turn it is.
     */
    async getWhosTurn() {
        const characters = this.getCurrentTurn();
        if (!characters) {
            const gm = this.getGMCharacter();
            const gmMemberID = await gm.getUserId();
            return [gmMemberID];
        }
        const ids = characters?.map(c => this.characters.get(c)?.getUserId());
        if (ids) return await Promise.all(ids) ?? [];
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
     * @returns {TextChannel} The characters channel of the roleplay.
     */
    getCharacterChannel() {
        return this.category.children.find(c => c.name === 'characters');
    }
    
    /**
     * 
     * @returns {TextChannel} The channel that the roleplay information is in.
     */
    getInformationChannel() {
        return this.category.children.find(c => c.name === 'information');
    }

    /**
     * 
     * @returns {TextChannel} The channel that the roleplay gm is in.
     */
    getGMChannel() {
        return this.category.children.find(c => c.name === 'gm');
    }

    /**
     * Get the GM character for this roleplay.
     * @returns {Character} The gm character.
     */
    getGMCharacter() {
        return this.characters.get(this.settings.gmCharacter);
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
            fs.unlink(file, (err) => { if (err) console.error(err); });
            //fs.rm(file);
        } else {
            content = messages.map(m => m.content).join('\n');
        }
        const parsed = this.parseContent(content);
        const channel = this.getMainChannel();
        const player = await Player.getByCharacter(channel.guild, character)
        const posts = new Array();
        if (character.id === this.settings.gmCharacter) this.newRound();
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
     * Delete the last post and send it back to the poster.
     * @param {number} turnOrderMode The turn order mode. (0 = nothing, 1 = add to current turn, 2 = create new turn.)
     * @returns {Promise<boolean>} If the roleplay was undone successfully.
     */
    async undoLastPost(turnOrderMode = 0) {
        const lastPostEntry = await RoleplayPost.findOne({ where: { roleplayId: this.id }, order: [['createdAt', 'DESC']] });
        if (!lastPostEntry) return false;
        const channel = this.getMainChannel();
        /** @type {Message[]} */
        const messagesPromises = JSON.parse(lastPostEntry.messages).map(m => channel.messages.fetch(m));
        const messages = await Promise.all(messagesPromises);
        const postContents = new Array();
        for (const message of messages) {
            postContents.push(message.embeds[0].description);
            await message.delete();
        }
        const content = postContents.join('\n');
        const path = Roleplay.DOWNLOAD_PATH + `${this.id}_undo.txt`;
        // Save the content to a file and send it to the poster.
        fs.writeFileSync(path, content);
        /** @type {Character} */
        const character = this.characters.get(lastPostEntry.characterId);
        const player = await Player.getByCharacter(this.guild, character);
        await player.member.send({ content: 'Your last post was undone. Here is the contents of that post.', files: [path] });
        fs.unlink(path, (err) => { if (err) console.error(err); });
        await lastPostEntry.destroy();
        if (character.id === this.getGMCharacter().id) {
            this.currentTurnOrder = [];
            this.round--;
        } else if (turnOrderMode === 1) {
            const currentTurn = this.getCurrentTurn();
            if (currentTurn) {
                currentTurn.push(character.id);
            } else {
                this.currentTurnOrder.push([character.id]);
            }
        } else if (turnOrderMode === 2) {
            this.currentTurnOrder.unshift([character.id]);
        }
        await this.save();
        await this.refreshControlMessage();
        return true;
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
     * @param {Player | string} player The player who is going to post or 'gm' for the GM.
     */
    async waitForPost(player) {
        const options = new Array();
        let gmCharacter;
        if (player === 'gm') {
            gmCharacter = this.characters.get(this.settings.gmCharacter);
            player = await Player.getByCharacter(this.guild, gmCharacter);
            options.push({
                label: gmCharacter.name,
                description: 'Posting as GM',
                value: `${gmCharacter.id}`,
            });
        } else {
            /** @type {Character[]} */
            const characters = Array.from(player.characters.values());
            const sortedCharacters = characters.sort((a, b) => {
                const aValue = this.getCurrentTurn().includes(a.id) ? 0 : 1;
                const bValue = this.getCurrentTurn().includes(b.id) ? 0 : 1;
                return aValue - bValue;
            });
            for (const character of sortedCharacters) {
                if (this.characters.has(character.id) && character.name !== 'GM') {
                    const isTurn = this.getCurrentTurn()?.includes(character.id);
                    options.push({
                        label: character.name,
                        description: `${isTurn ? 'CURRENT TURN! ' : ''}Choose ${character.name} to post.`,
                        value: `${character.id}`,
                    });
                }
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
                character = this.characters.get(parseInt(response.values[0]));
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
            character = this.characters.get(parseInt(options[0].value));
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
        if (!this.isTurn(character)) {
            embed.setDescription(`${embed.description}\n\nWARNING: IT IS NOT CURRENTLY YOUR TURN IN THE ROLEPLAY.`);
        }
        message = /** @type {Message} */ (await player.member.send({ embeds: [embed], components: [] }));
        let repeat = true;
        const messages = new Array();
        while (repeat) {
            const responses = await message.channel.awaitMessages({ max: 1, time: 600_000 });
            const responseMessage = responses.first();
            if (responseMessage.content.toLowerCase() === 'done') {
                if (messages.length === 0) {
                    await message.delete();
                    return false;
                }
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
                        .setStyle('LINK')
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

        const dmAR = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setLabel('Goto')
                    .setStyle('LINK')
                    .setURL(`https://discord.com/channels/@me/${interaction.user.dmChannel?.id || await interaction.user.createDM()?.id}`));
                    

        if (command === 'post') {
            const player = await Player.getByMemberId(interaction.guild, interaction.user.id);
            if (player) {
                if (this.busy) {
                    await interaction.editReply('Someone is already posting in this roleplay.');
                    return false;
                } else {
                    await interaction.editReply({ content: 'Please check your DMs to post.', components: [dmAR] });
                    this.busy = true;
                    const result = await this.waitForPost(player);
                    this.busy = false;
                    return result
                }
            }
            await interaction.editReply({ content: 'You are not registered.' });
            return false;
        } else if (command === 'character') {
            let player = await Player.getByMemberId(interaction.guild, interaction.user.id);
            if (!player) {
                player = await Player.new(interaction.guild, interaction.member);
            }
            const channel = await player.category.createChannel('creating-character');
            await channel.permissionOverwrites.create(this.gm, {
                VIEW_CHANNEL: true,
            });
            await interaction.editReply({ content: `Please head to <#${channel.id}> to create your character.` });
            const character = await Character.build(channel);
            if (character === null) {
                await interaction.editReply({ content: 'Could not create character.' });
                await wait(5000);
                await channel.delete();
                return false;
            }
            let channelName = character.name;
            channelName = channelName.toLowerCase();
            channelName = channelName.replace(/[^a-z0-9]/g, '');
            await channel.edit({ name: channelName });
            await player.addCharacter(character);
            await this.addCharacter(character);

            const role = await interaction.guild.roles.create({ name: character.name, color: character.color });
            await interaction.member.roles.add(role);

            await interaction.editReply({ content: 'Character created.' });
        } else if (command === 'refreshAll') {
            await this.refreshControlMessage();
            await this.refreshCharacterControlMessage();
            await this.refreshGMControlMessage();
            for (const panel of this.controlPanels.values()) {
                await panel.refresh();
            }
            await interaction.editReply({ content: 'Refreshed.' });
            return true;
        } else if (command === 'refresh') {
            await this.refreshGMControlMessage();
            await interaction.editReply({ content: 'Refreshed.' });
            return true;
        } else if (command === 'gmpost') {
            await interaction.editReply({ content: 'Please check your DMs to post.', components: [dmAR] });
            if (this.busy) {
                await interaction.editReply('Someone is already posting in this roleplay.');
            } else {
                await interaction.editReply({ content: 'Please check your DMs to post.', components: [dmAR] });
                this.busy = true;
                const result = await this.waitForPost('gm');
                this.busy = false;
                return result
            }
            return false;
        } else if (command.startsWith('undo')) {
            if (command.endsWith('1')) { 
                await this.undoLastPost(1);
            } else if (command.endsWith('2')) {
                await this.undoLastPost(2);
            } else {
                await this.undoLastPost();
            }
            await interaction.editReply({ content: 'Undid.' });
        } else if (command === 'setturnorder') {
            const newTurnOrder = await this.promptForTurnOrder(interaction.channel);
            if (newTurnOrder !== null) {
                this.setTurnOrder(newTurnOrder);
                await interaction.editReply({ content: 'Turn Order Set.' });
            } else {
                await interaction.editReply({ content: 'Turn Order Cancelled.' });
            }
        } else if (command === 'showUndo') {
            this.showUndo = !this.showUndo;
            await this.refreshGMControlMessage(true);
            await interaction.editReply({ content: 'Undo messages are now ' + (this.showUndo ? 'shown.' : 'hidden.') });
        } else if (command.startsWith('increment')) {
            await interaction.editReply({ content: 'Please post the act title, null, or cancel' });
            const responses = await interaction.channel.awaitMessages({ max: 1, time: 60_000 });
            const responseMessage = responses.first();
            if (!responseMessage) interaction.editReply({ content: 'Cancelled.' });
            if (responseMessage.content.toLowerCase() === 'null') {
                if (command.endsWith('Act')) {
                    this.incrementAct(null);
                } else if (command.endsWith('Chapter')) {
                    this.incrementChapter(null);
                }
            } else if (responseMessage.content.toLowerCase() === 'cancel') {
                await interaction.editReply({ content: 'Cancelled.' });
            } else {
                if (command.endsWith('Act')) {
                    this.incrementAct(responseMessage.content);
                } else if (command.endsWith('Chapter')) {
                    this.incrementChapter(responseMessage.content);
                }
            }
            await responseMessage.delete();
            interaction.editReply({ content: 'Incremented.' });
        } else if (command.startsWith('panel')) {
            const channelID = interaction.channelId;
            const panel = this.controlPanels.get(channelID);
            await panel.handleInteraction(interaction, command);
        } else if (command === 'poke') {
            const userIDs = await this.getWhosTurn();
            const users = await interaction.guild.members.fetch({ user: userIDs });
            const channel = this.getMainChannel();
            const channelLink = `https://discord.com/channels/${channel.guild.id}/${channel.id}`;
            for (const user of users.values()) {
                const embed = new MessageEmbed()
                    .setTitle('Poked!')
                    .setDescription(`It is currently your turn in [${this.name}](${channelLink}).`)
                    .setColor(this.settings.color);
                await user.send({
                    embeds: [embed],
                })
            }
            await interaction.editReply({ content: 'Poked.' });
        }
    }

    /**
     * Move the roleplay along as if this character has posted.
     * @param {Character} character The character that posted.
     */
    posted(character) {
        const currentTurn = this.currentTurnOrder[0];
        if (currentTurn?.includes(character.id)) {
            const index = currentTurn.indexOf(character.id);
            currentTurn.splice(index, 1);
        }
        if (currentTurn?.length === 0) {
            this.currentTurnOrder.shift();
        }
        this.calculateTurnTime();
        this.refreshControlMessage();
    }

    /**
     * Generate a new round.
     */
    newRound() {
        this.round++;
        this.resetCurrentTurnOrder();
    }

    /**
     * Sets currentTurnOrder to the turn order.
     */
    resetCurrentTurnOrder() {
        this.currentTurnOrder = this.turnOrder.map(turn => turn.slice());
    }

    /**
     * Calculate the exact date and time the next turn has to occur by.
     */
    calculateTurnTime() {
        let date;
        if (this.turnDuration) {
            date = new Date(Date.now() + this.turnDuration);
        } else {
            date = null;
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