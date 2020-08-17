const { MongoClient } = require('mongodb');
const { v4: uuid } = require('uuid');

const MONGO_URI = 'MONGO_URI';
const MONGO_DB = 'lunchtimeapp';
const USERS_COLLECTION = 'users';

/**
 * Handler for ‘Pre Token Generation’ Lambda trigger in a Cognito User Pool.
 *
 * Tries to retrieve the user from the application database based on the login identity to access its `uid`.
 * If the user is not found, a new user record is created with a new unique `uid`.
 * The `uid` is then added as a claim to the tokens generated by Cognito.
 *
 * @param {Object} event - Pre Token Generation Lambda Trigger Parameters
 * @param {Object} context
 * @returns {Object} Pre Token Generation Lambda Trigger Parameters
 *
 * @see {@link https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-token-generation.html Doc}
 * @see {@link https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html Context doc}
 */
exports.lambdaHandler = async (event, context) => {

  console.log(context);
  // First check that required configuration is available, to fail fast.
  const uri = process.env[MONGO_URI];
  if (!uri) throw new Error(`Missing ${MONGO_URI} environment variable.`);

  // Next retrieve the information from the event.

  const identities = JSON.parse(event.request.userAttributes.identities);
  if (!Array.isArray(identities) || identities.length < 1) throw new Error('Missing identities in event.');
  // Use the first identity.
  const { providerType: federatedProviderType, userId: federatedUserId } = identities[0]; // TODO: Support multiple identities.
  if (!federatedProviderType || !federatedUserId) throw new Error('Missing identity.');
  const federatedProviderTypeLower = federatedProviderType.toLowerCase();

  const mongo = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongo.connect();
  try {

    const db = mongo.db(MONGO_DB);
    const users = db.collection(USERS_COLLECTION);
    console.log(`Looking up federated '${federatedProviderTypeLower}' user '${federatedUserId}'.`);
    const user = await users.findOne({
      'auth.federations': {
        $elemMatch: {
          provider: federatedProviderTypeLower,
          id: federatedUserId
        }
      }
    });
    console.log('User:', user);

    if (!user) {
      // Check the input data.
      if (!event.userPoolId) throw new Error('Missing User Pool ID in event.');
      const identityProvider = `cognito:${event.userPoolId}`;
      const attrs = event.request.userAttributes;
      if (!attrs.sub) throw new Error('Missing `sub` attribute in event.');
      // Construct the new user object.
      const newUser = {
        uid: uuid(),
        auth: {
          identities: [
            {
              provider: identityProvider,
              id: attrs.sub
            }
          ],
          federations: [
            {
              provider: federatedProviderTypeLower,
              id: federatedUserId
            }
          ]
        },
        profile: {
          name: attrs.name,
          givenName: attrs.given_name,
          familyName: attrs.family_name,
          email: attrs.email
        },
        createdAt: new Date().toISOString()
      };
      console.log('New user:', JSON.stringify(newUser, null, 2));
    }

    // Test overriding tokens.
    event.response = {
      claimsOverrideDetails: {
        claimsToAddOrOverride: {
          uid: 'TODO'
        },
        claimsToSuppress: [
          'email_verified',
          'cognito:groups'
        ]
      }
    };
  }
  finally {
    await mongo.close();
  }

  return event;
}
