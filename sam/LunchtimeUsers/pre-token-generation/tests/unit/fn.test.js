'use strict';
const { v4: uuid } = require('uuid');
jest.mock('uuid');

const { MongoClient, DBRef } = require('mongodb');
const { lambdaHandler } = require('../../fn.js');

describe('lambdaHandler', function () {

  const event = require('../../../events/pre-token-generation.json');
  const context = {};

  describe('w/o env vars', () => {

    test('throws missing MONGO_URI', async () => {

      await expect(lambdaHandler(event, context)).rejects.toThrow('Missing MONGO_URI environment variable.');
    });
  });

  describe('w/ env vars', () => {

    let connection;
    let db;
    const UUID = 'e824dadc-d932-44fa-bb9d-2e75fb295fbc';

    beforeAll(async () => {
      process.env.MONGO_URI = process.env.MONGO_URL; // Map mongodb in-memory helper URI.
      connection = await MongoClient.connect(process.env.MONGO_URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      db = await connection.db();
      uuid.mockImplementation(() => UUID);
    });

    afterAll(async () => {
      await connection.close();
    });

    test('verifies successful response', async () => {

      const result = await lambdaHandler(event, context);
      expect(result.response.claimsOverrideDetails.claimsToAddOrOverride.uid).toBe(UUID);
    });
  });
});
