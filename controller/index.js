'use strict';

const config = require('../config');
const projectKeeper = require('../libs/projectKeeper');
const logger = projectKeeper.getLogger('Controller');

// symbols helpers (pass response args)
const sMethodName = Symbol('sMethodName');
const sMethodVersion = Symbol('sMethodVersion');
const sRequestParams = Symbol('sRequestParams');
const sRequestUrl = Symbol('sRequestUrl');
const sRequestMethod = Symbol('sRequestMethod');
const sRequestHeaders = Symbol('sRequestHeaders');
const sResponseCode = Symbol('sResponseCode');
const sApiResponseCode = Symbol('sApiResponseCode');
const sRequestObject = Symbol('sRequestObject');
const sResponseObject = Symbol('sResponseObject');
const sAuthorizedUser = Symbol('sAuthorizedUser');
const sSecure = Symbol('sSecure');

const STATUS_CODES = require('./STATUS_CODES');
const API_CODES = require('./API_CODES');
const ACCESS_LEVELS = require('./ACCESS_LEVELS');

const {
    packageDescription,
} = config;

function throwResponseError(code = STATUS_CODES.TEAPOT, apiCode = API_CODES.UNKNOWN, message = 'Unknown reason') {
    const err = new Error(message);

    if (typeof message === 'object') {
        err.detailedObject = message;
    }

    Object.assign(err, {
        [sResponseCode]: code,
        [sApiResponseCode]: apiCode,
    });
    throw err;
}

function wrapMethod(method, params = {}) {
    const {
        accessLevel = ACCESS_LEVELS.ALL,
    } = params;

    method.accessLevel = accessLevel;

    return method;
}

/**
 * Определяем наименование публичного метода, к которому происходит обращение.
 * Метод обязательно должен быть назван в стиле lowerCamelCase, а обращение к нему возможно как в стиле lowerCamelCase так и в стиле snake_case
 * Список допустимых методов и действий находится в файле api в возвращаемой секции
 *
 * @param {Object} req
 * @returns {{requestHandler: Function, apiName: String, methodName: String, api: Object, version: String, accessLevel: number}}
 */
function getMethodData(req = {}) {
    const {
        url = '',
        params = {},
    } = req;

    let {
        apiName = '',
        type = '',
        action = '',
        version = 'v1',
    } = params;

    // Require js api file from ./api dir
    const api = require(`../api/${version}/${apiName}`);
    if (typeof api !== 'object') {
        throwResponseError(STATUS_CODES.NOT_FOUND, API_CODES.API_NOT_FOUND, `Undefined api: url: ${url}`);
    }

    let methodName = action;
    if (type) {
        methodName += type[0].toUpperCase() + type.slice(1);
    }

    const requestHandler = api[methodName];
    if (typeof requestHandler !== 'function') {
        throwResponseError(STATUS_CODES.NOT_FOUND, API_CODES.METHOD_NOT_FOUND, `Undefined api method: ${methodName} from url: ${url}`);
    }

    const apiAccessLevel = api.accessLevel;
    const accessLevel = requestHandler.accessLevel;

    return {
        api,
        apiName,
        methodName,
        version,
        requestHandler,
        accessLevel,
        apiAccessLevel,
    };
}

function setControlHeaders(res = {}, params = {}) {
    // Information about package version
    res.setHeader('X-Version', packageDescription);
    // Only usual requests permitted
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // No frames
    res.setHeader('X-Frame-Options', 'DENY');
    // TODO: Add adjustable cache-control settings
    res.setHeader('Cache-Control', 'no-cache');
}

function routeHandler(req = {}, res = {}) {
    logger.info(`Get request for route ${req.url}`);

    return Promise.resolve()
        .then(() => getMethodData(req))
        .then(methodData => {
            const {
                method,
                headers,
                params,
                url,
                body,
                user,
            } = req || {};

            const {
                requestHandler,
                methodName,
                apiVersionName,
                accessLevel = ACCESS_LEVELS.ALL,
                apiAccessLevel = ACCESS_LEVELS.ALL,
            } = methodData;

            logger.debug(`WebServer: Get params for route ${url} to use in method ${methodName}, user ${user}`);

            // Check permissions (api permissions has priority)
            checkPermissions(user, Math.max(apiAccessLevel, accessLevel));

            Object.assign(body, {
                [sRequestObject]: req,
                [sResponseObject]: res,
                [sRequestUrl]: url,
                [sRequestHeaders]: headers,
                [sRequestMethod]: method,
                [sRequestParams]: params,
                [sMethodName]: methodName,
                [sMethodVersion]: apiVersionName,
                [sAuthorizedUser]: user,
            });

            // Include headers into response object
            setControlHeaders(res, req.body);

            return requestHandler(body);
        })
        .then(result => createResponseObject(result))
        .catch(err => createResponseObject(err))
        .then(result => sendResponse(req, res, result))
        .catch(err => {
            logger.error(`routesHandler: Handling ${req.url} Unknown Error:`, err);
        })
    ;
}

function createResponseObject(resultObject = {}) {
    // Error response object is specific and should be handled separately
    if (resultObject instanceof Error) {
        logger.error(resultObject);

        const errorCode = resultObject[sResponseCode] || STATUS_CODES.SERVER_ERROR;
        const apiCode = resultObject[sApiResponseCode] || API_CODES.UNKNOWN;

        return {
            code: apiCode,
            body: resultObject.detailedObject || resultObject.toString(),
            [sResponseCode]: errorCode,
        };
    }

    // Standard response object
    const apiCode = resultObject[sApiResponseCode] || API_CODES.SUCCESS;
    const responseObject = {
        code: apiCode,
        body: resultObject,
    };

    if (typeof resultObject === 'object') {
        const responseCode = resultObject[sResponseCode];
        if (responseCode) {
            responseObject[sResponseCode] = responseCode;
        }
    }

    return responseObject;
}

function sendResponse(req = {}, res = {}, result = {}) {
    logger.debug(`sendResponse: ${req.url}`);

    const statusCode = result[sResponseCode] || 200;
    if (statusCode !== 200) {
        try {
            res.status(statusCode);
        }
        catch(err) {
            logger.error('sendResponse: set response status error: ', err);
        }
    }

    res.json(result);
    return true;
}

function accessDenied(user, methodAccessLevel = 0) {
    let accessDenied = false;

    if (!user) {
        if (methodAccessLevel > ACCESS_LEVELS.ALL) {
            accessDenied = true;
        }
    }
    else if (user.accessLevel < methodAccessLevel) {
        accessDenied = true;
    }

    return accessDenied;
}

function checkPermissions(user, methodPermissions = 0) {
    const isAccessDenied = accessDenied(user, methodPermissions);
    if (isAccessDenied) {
        if (user) {
            throwResponseError(STATUS_CODES.FORBIDDEN, API_CODES.ACCESS_DENIED, 'You have no power here');
        }
        else {
            throwResponseError(STATUS_CODES.UNAUTHORIZED, API_CODES.UNAUTHORIZED, 'You have no power. Authorize, please');
        }
    }
}

module.exports = {
    // Middleware for all api-requests
    routeHandler,
    wrapMethod,

    sRequestObject,
    sResponseObject,
    sMethodName,
    sMethodVersion,
    sRequestParams,
    sRequestUrl,
    sRequestMethod,
    sRequestHeaders,
    sResponseCode,
    sAuthorizedUser,
    sApiResponseCode,
    sSecure,

    ACCESS_LEVELS,
    API_CODES,
    STATUS_CODES,

    throwResponseError,
    packageDescription,
};