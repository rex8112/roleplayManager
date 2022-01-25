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
}

module.exports = {
    Character,
};