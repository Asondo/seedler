'use strict';

const config = require('seedler:config');
const logger = config.getLogger('Controller initialization');

module.exports = function() {
    logger.info(`Try to initialize api controller`);

    const controller = require('require-all')(config.rootDir + '/controller');

};