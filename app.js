'use strict';

const requireLinker = require('./libs/requireLinker');
// Use require('seedler:config') from everywhere
requireLinker.link('seedler', './config');
// Use require('seedler:libs/libraryName') from everywhere
requireLinker.link('seedler', './libs');
requireLinker.link('seedler', './package');

const config = require('seedler:config');
const launch = require('seedler:libs/launch');
const logger = config.getLogger('WebServer');
const express = require('express');

const app = launch(express());

const controllers = require('require-all')(config.rootDir + '/controllers');

Object.assign(config, {
    app,
    controllers,
});

app
    .stage('./setup/mongodb')
    .stage('./setup/redis')
    .stage('./setup/controller')
    .run(() => {
        const {
            port = 8080,
        } = config.server;

        logger.info(`App now listen on port ${port}...`);
        app.listen(port);
    })
    .then(() => {
        logger.info('Seedler instance started!');
    })
    .catch(err => logger.error(err))
;

