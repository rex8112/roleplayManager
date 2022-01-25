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
            return null, error;
        }
    }

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
            return null, error;
        }
    }

    // Instance methods
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