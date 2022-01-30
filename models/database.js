const { Sequelize, DataTypes } = require('sequelize');
const { databaseName, databaseUser, databasePassword, databaseHost, databasePort } = require('../config.json');

const sequelize = new Sequelize(databaseName, databaseUser, databasePassword, {
    host: databaseHost,
    port: databasePort,
    dialect: 'mariadb',
    dialectOptions: {
        bigNumberStrings: true,
        autoJsonMap: false,
    },
    logging: false,
});

const Information = sequelize.define('information', {
    id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    type: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    value: {
        type: DataTypes.STRING,
        allowNull: false,
    },
});

const Character = sequelize.define('character', {
    id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    color: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: '#FFFFFF',
    },
    user: {
        type: DataTypes.BIGINT,
    },
    knowledge: {
        type: DataTypes.JSON,
        allowNull: false,
    },
    publicInformation: {
        type: DataTypes.JSON,
        allowNull: false,
    },
    privateInformation: {
        type: DataTypes.JSON,
        allowNull: false,
    },
    gmInformation: {
        type: DataTypes.JSON,
        allowNull: false,
    },
});

const Player = sequelize.define('player', {
    id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    guild: {
        type: DataTypes.BIGINT,
        allowNull: false,
    },
    member: {
        type: DataTypes.BIGINT,
        allowNull: false,
    },
    characters: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
    },
    category: {
        type: DataTypes.BIGINT,
        allowNull: false,
    }
});

module.exports = {
    Information,
    Character,
    Player,
    sequelize,
};