// character.js
const { Collection } = require('discord.js');
const { Information } = require('./information');
const { Character: CDB } = require('./database');

class Character {
    constructor() {
        this.id = 0;
        this.entry = null;
        this.name = '';
        this.playerId = null;
        this.color = '#ffffff';

        this.knowledge = new Array();

        this.publicInformation = new Collection();
        this.privateInformation = new Collection();
        this.gmInformation = new Collection();
    }

    // Static methods
    /**
     * Create a new character and add it to the database.
     * @param {string} name The name of the character.
     * @returns {Promise<Character>} A promise that resolves to the new character.
     */
    static async new(name) {
        const character = new Character();
        character.name = name;
        const data = character.toJSON();
        delete data.id;
        const entry = await CDB.create(data);
        character.id = entry.id;
        character.entry = entry;
        return character;
    }

    /**
     * Get a character from the database.
     * @param {number} id The id of the character to retrieve.
     * @returns {Promise<Character>} A promise that resolves to the character.
     */
    static async get(id) {
        const entry = await CDB.findOne({ where: { id } });
        if (!entry) return null;
        const character = await Character.fromJSON(entry);
        return character;
    }
    
    /**
     * Get a collection of characters owned by a user.
     * @param {string} id The id of the user who owns the character.
     * @returns {Promise<Collection<string, Character>>} A promise that resolves to a collection of characters.
     */
    static async getByUserId(id) {
        const charactersCollection = new Collection();
        const characters = await CDB.findAll({ where: { user: id } });
        for (const data of characters) {
            const character = await Character.fromJSON(data);
            charactersCollection.set(character.id, character);
        }
        return charactersCollection;
    }

    /**
     * Convert a JSON object to a character.
     * @param {Object} json The JSON object to convert to a character.
     * @returns The new character.
     */
    static async fromJSON(json) {
        const character = new Character();
        character.id = json.id;
        character.name = json.name;
        character.entry = json;
        character.playerId = json.playerId;
        character.color = json.color;
        character.knowledge = Array.from(json.knowledge);
        character.publicInformation = new Collection(await Promise.all(json.publicInformation.map(async i => [i, await Information.get(i)])));
        character.privateInformation = new Collection(await Promise.all(json.privateInformation.map(async i => [i, await Information.get(i)])));
        character.gmInformation = new Collection(await Promise.all(json.gmInformation.map(async i => [i, await Information.get(i)])));
        return character;
    }

    // Instance methods
    /**
     * Save the character to the database.
     */
    async save() {
        await CDB.update(this.toJSON(), { where: { id: this.id } });
    }

    /**
     * Set a character's name and change all of the information's name prefixes to comply.
     * @param {string} name The new name of the character.
     */
    setName(name) {
        this.name = name;
        for (const information of this.publicInformation.values()) {
            information.name = information.name.replace(/(\([^\)]*\))/gm, `(${name})`);
            information.save();
        }
        for (const information of this.privateInformation.values()) {
            information.name = information.name.replace(/(\([^\)]*\))/gm, `(${name})`);
            information.save();
        }
        for (const information of this.gmInformation.values()) {
            information.name = information.name.replace(/(\([^\)]*\))/gm, `(${name})`);
            information.save();
        }
        this.save();
    }

    /**
     * Add information to a character.
     * @param {string} classification The clearance classification of the information.
     * @param {Information} information The information object to add.
     */
    addInformation(classification, information) {
        if (classification === 'public') {
            this.publicInformation.set(information.id, information);
        } else if (classification === 'private') {
            this.privateInformation.set(information.id, information);
        } else if (classification === 'gm') {
            this.gmInformation.set(information.id, information);
        } else {
            throw new Error('Invalid classification');
        }
    }

    /**
     * Removes information from a character.
     * @param {number} id The id of the information to retrieve.
     */
    removeInformation(id) {
        this.publicInformation.delete(id);
        this.privateInformation.delete(id);
        this.gmInformation.delete(id);
    }

    /**
     * Set the clearance classification of a character's information.
     * @param {number} id The id of the information to change.
     * @param {string} classification The classification of the information. (public, private, gm)
     * @returns {boolean} Whether or not the information was changed.
     */
    setInformationClassification(id, classification) {
        let information = null;

        // Find the information object
        if (this.publicInformation.has(id)) {
            information = this.publicInformation.get(id);
            this.publicInformation.delete(id);
        } else if (this.privateInformation.has(id)) {
            information = this.privateInformation.get(id);
            this.privateInformation.delete(id);
        } else if (this.gmInformation.has(id)) {
            information = this.gmInformation.get(id);
            this.gmInformation.delete(id);
        } else {
            return false;
        }

        // Add the information to the new classification
        if (classification === 'public') {
            this.publicInformation.set(id, information);
        } else if (classification === 'private') {
            this.privateInformation.set(id, information);
        } else if (classification === 'gm') {
            this.gmInformation.set(id, information);
        } else {
            throw new Error('Invalid classification');
        }
        return true;
    }

    /**
     * Add an attribute to the character.
     * @param {string} name The name of the attribute to add.
     * @param {number} value The value of the attribute.
     * @param {string} classification The classification of the attribute. (public, private, gm)
     */
    async addAttribute(name, value, classification = 'public') {
        const information = await Information.new(`(${this.name})${name}`, 'attribute', value);
        this.addInformation(classification, information);
    }

    /**
     * 
     * @param {Array<string>} classificationList A list of the classification of the attributes to retrieve. (public, private, gm)
     * @returns {Collection<number, Information>} A collection of the attributes.
     */
    getAttributes(classificationList = ['public']) {
        let attributes = new Collection();
        if ('gm' in classificationList)
            attributes = attributes.concat(this.gmInformation.filter(i => i.type === 'attribute'))
        if ('private' in classificationList)
            attributes = attributes.concat(this.privateInformation.filter(i => i.type === 'attribute'))
        if ('public' in classificationList)
            attributes = attributes.concat(this.publicInformation.filter(i => i.type === 'attribute'))
        return attributes;
    }

    /**
     * An alias for removeInformation.
     * @param {number} id The id of the attribute to retrieve.
     */
    removeAttribute(id) {
        this.removeInformation(id);
    }

    /**
     * Add a skill to the character.
     * @param {string} name The name of the skill to add.
     * @param {number} value The value of the skill.
     * @param {string} classification The classification of the skill. (public, private, gm)
     */
    async addSkill(name, value, classification = 'public') {
        const information = await Information.new(`(${this.name})${name}`, 'skill', value);
        this.addInformation(classification, information);
    }

    /**
     * Get a collection of the skills.
     * @param {array<string>} classificationList A list of the classification of the skills to retrieve. (public, private, gm)
     * @returns {Collection<number, Information>} A collection of the skills.
     */
    getSkills(classificationList = ['public']) {
        let skills = new Collection();
        if ('gm' in classificationList)
            skills = skills.concat(this.gmInformation.filter(i => i.type === 'skill'))
        if ('private' in classificationList)
            skills = skills.concat(this.privateInformation.filter(i => i.type === 'skill'))
        if ('public' in classificationList)
            skills = skills.concat(this.publicInformation.filter(i => i.type === 'skill'))
        return skills;
    }

    /**
     * An alias for removeInformation.
     * @param {number} id The id of the skill to remove.
     */
    removeSkill(id) {
        this.removeInformation(id);
    }

    /**
     * Add generic information to the character.
     * @param {string} name The name of the information to add.
     * @param {string} value The value of the information.
     * @param {string} classification The classification of the information. (public, private, gm)
     */
    async addGenericInformation(name, value, classification = 'public') {
        const information = await Information.new(`(${this.name})${name}`, 'generic', value);
        this.addInformation(classification, information);
    }

    /**
     * Get a collection of the generic information.
     * @param {array<string>} classificationList A list of the classification of the generic information to retrieve. (public, private, gm)
     * @returns {Collection<number, Information>} A collection of the generic information.
     */
    getGenericInformation(classificationList = ['public']) {
        let information = new Collection();
        if ('gm' in classificationList)
            information = information.concat(this.gmInformation.filter(i => i.type === 'generic'))
        if ('private' in classificationList)
            information = information.concat(this.privateInformation.filter(i => i.type === 'generic'))
        if ('public' in classificationList)
            information = information.concat(this.publicInformation.filter(i => i.type === 'generic'))
        return information;
    }

    /**
     * An alias for removeInformation.
     * @param {number} id The id of the information to remove.
     */
    removeGenericInformation(id) {
        this.removeInformation(id);
    }

    /**
     * Convert the character to a JSON object.
     * @returns {Object} The character's information in a JSON format.
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            user: this.playerId?.id,
            color: this.color,
            knowledge: this.knowledge,
            publicInformation: Array.from(this.publicInformation.keys()),
            privateInformation: Array.from(this.privateInformation.keys()),
            gmInformation: Array.from(this.gmInformation.keys())
        }
    }
}

module.exports = {
    Character,
};