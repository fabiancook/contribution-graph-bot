import Moment from 'moment-timezone';
import Art from './art';
import AWS from 'aws-sdk';
import Assert from 'assert';

const KMS = new AWS.KMS();

async function getDecryptedValue(value) {
  if (value.indexOf('arn') !== 0) {
    return value;
  }
}

/**
 * @returns {Promise.<EnvVariables>|EnvVariables}
 */
async function getEnvironmentVariables() {
  const keys = [
    'GITHUB_TOKEN',
    'GITHUB_USER',
    'GITHUB_REPO',
    'GITHUB_STATE_FILE'
  ];

  const variables = await Promise.all(
    keys.map(async key => {
      const value = await getDecryptedValue(process.env[key]);
      Assert(typeof value === 'string' && !!value, `Expected value for environment variable "${key}"`);
      return {
        key,
        value
      };
    })
  );

  return variables.reduce(
    (map, { key, value }) => ({ ...map, [key]: value }),
    {}
  );
}

export const handler = async (event, context, cb) => {
  const variables = await getEnvironmentVariables()




};


/**
 * @typedef {object} EnvVariables
 * @property {string} GITHUB_TOKEN
 * @property {string} GITHUB_USER
 * @property {string} GITHUB_REPO
 * @property {string} GITHUB_STATE_FILE
 */