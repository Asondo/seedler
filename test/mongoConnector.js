'use strict';

const config = require('../config');
config.linkGlobalPaths();

const mongoConnector = require('seedler:libs/mongoConnector');
// const logger = config.getLogger('MongoConnector');
const expect = require('expect.js');

const startTimestamp = Date.now();
const collectionName = 'test';
const testField = `value${startTimestamp}`;
const testDoc = {
    _id: startTimestamp,
    [testField]: 1,
};

let promise = Promise.resolve();

describe('Test mongodbConnector', () => {
    it('Test connection', () => {
        promise = promise
            .then(() => mongoConnector.connect())
            .then(db => {
                expect(db).not.to.equal(null);
                expect(db).to.be.an('object');
            })
        ;
        return promise;
    });

    it('Test index normalization', () => {
        promise = promise.then(() => mongoConnector.checkCollection({
            name: collectionName,
            indexes: [
                {[testField]: 1},
            ],
        }));
        return promise;
    });

    // Remove all from collection
    it('Flush collection', () => {
        promise = promise.then(() => mongoConnector.delete(collectionName, {multi: true}));
        return promise;
    });

    it('Test insert document', () => {
        promise = promise
            .then(() => mongoConnector.insert(collectionName, testDoc))
            .catch(err => expect(err).to.be(null))
        ;
        return promise;
    });

    it('Test update document', () => {
        const changeItem = {
            [testField]: startTimestamp,
        };
        Object.assign(testDoc, changeItem);

        const match = mongoConnector.generateMatchObject({_id: testDoc._id});
        promise = promise
            .then(() => mongoConnector.update(collectionName, {match, set: changeItem}))
            .catch(err => expect(err).to.be(null))
        ;
        return promise;
    });

    it('Test get document', () => {
        const match = mongoConnector.generateMatchObject({_id: testDoc._id});
        promise = promise
            .then(() => mongoConnector.get(collectionName, {match}))
            .then(itemList => {
                const docFromDB = itemList.shift();
                expect(docFromDB).to.eql(testDoc);
            })
            .catch(err => expect(err).to.be(null))
        ;
        return promise;
    });

    it('Test delete document', () => {
        const match = mongoConnector.generateMatchObject({_id: testDoc._id});
        promise = promise
            .then(() => mongoConnector.delete(collectionName, {match}))
            .then(() => mongoConnector.get(collectionName, {match}))
            .then(itemList => expect(itemList).to.have.length(0))
            .catch(err => expect(err).to.be(null))
        ;
        return promise;
    });

    it('Close connection', () => {
        return promise
            .then(() => mongoConnector.closeConnection(true))
        ;
    });
});