// character.js
const { Collection } = require("discord.js");
const { Information } = require("../information");

class Character {
    constructor() {
        this.name = '';
        this.member = null;
        this.guild = null;

        this.publicInformation = new Collection();
        this.privateInformation = new Collection();
        this.gmInformation = new Collection();
    }

    // Instance methods
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
}