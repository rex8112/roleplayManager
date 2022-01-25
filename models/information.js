// information.js
const { IDB } = require('../database');

class Information {
    constructor() {
        this.id = 0;
        this.name = '';
        this.type = '';
        this.value = '';
    }

    // Static methods
    /**
     * Create a new information object and save it to the database.
     * @param {string} name The name of the information.
     * @param {string} type The type of the information. (generic, attribute, skill, etc.)
     * @param {string} value The value of the information.
     * @returns {Promise<Information>} The information object.
     */
    static async new(name, type, value) {
        try {
            const information = new Information();
            information.name = name;
            information.type = type;
            information.value = value;
            const entry = await IDB.create({ name, type, value });
            information.id = entry.id;
            return information;
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    /**
     * Get the information object from the database.
     * @param {number} id The id of the information to retrieve.
     * @returns {Promise<Information>} The information object.
     */
    static async get(id) {
        try {
            const entry = await IDB.findOne({ where: { id } });
            if (!entry) return null;
            const information = new Information();
            information.id = entry.id;
            information.name = entry.name;
            information.type = entry.type;
            information.value = entry.value;
            return information;
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    // Instance methods
    /**
     * Convert the information to a JSON object.
     * @returns {Object} The information object.
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            value: this.value,
        };
    }
}

module.exports = {
    Information,
};