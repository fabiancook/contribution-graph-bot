import Moment from 'moment-timezone';
import Art from './art';
import AWS from 'aws-sdk';
import Assert from 'assert';
import fetch from 'node-fetch';

const KMS = new AWS.KMS();

const CURRENT_STATE = Symbol('Current State');

async function getDecryptedValue(value) {
  if (value.indexOf('kms:') !== 0) {
    return value;
  }
  const encrypted = value.split(':').slice(1).join(':');
  const encryptedBuffer = new Buffer(encrypted, 'base64');
  return new Promise(
    (resolve, reject) => {
      KMS.decrypt({ CiphertextBlob: encryptedBuffer }, (error, data) => error ? reject(error) : resolve(data.Plaintext.toString('ascii')))
    }
  );
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

/**
 * @param {EnvVariables} variables
 * @returns {Promise.<ArtStateInfo>|ArtStateInfo}
 */
async function getCurrentState(variables) {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(variables.GITHUB_USER)}/${encodeURIComponent(variables.GITHUB_REPO)}/contents/${encodeURIComponent(variables.GITHUB_STATE_FILE)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `token ${variables.GITHUB_TOKEN}`,
        Accept: 'application/json'
      }
    }
  );
  const info = await response.json();
  console.log(info, `https://api.github.com/repos/${variables.GITHUB_USER}/${variables.GITHUB_REPO}/contents/${variables.GITHUB_STATE_FILE}`);
  Assert(typeof info === 'object' && !Array.isArray(info), 'Expected an json object descriptor for the state file');
  Assert(info.type === 'file', `Expected type of state file to be "file", received "${info.type}"`);
  Assert(typeof info.sha === 'string' && !!info.sha, 'Expected sha');
  const data = new Buffer(info.content, info.encoding);
  const json = data.toString('utf8');
  const state = JSON.parse(json) || {};
  // Re-stringify it, so we can ignore any formatting that may be present
  state[CURRENT_STATE] = JSON.stringify(state);
  return {
    state,
    sha: info.sha
  };
}

/**
 * @param {EnvVariables} variables
 * @param {ArtState} state
 * @param {string} sha
 * @returns {Promise.<void>}
 */
async function saveState(variables, state, sha) {
  // Nothing changed, don't update
  if (state[CURRENT_STATE] === JSON.stringify(state)) {
    return null;
  }
  const json = JSON.stringify(state, null, '  ');
  const base64 = new Buffer(json, 'utf8').toString('base64');

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(variables.GITHUB_USER)}/${encodeURIComponent(variables.GITHUB_REPO)}/contents/${encodeURIComponent(variables.GITHUB_STATE_FILE)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `token ${variables.GITHUB_TOKEN}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Update ${variables.GITHUB_STATE_FILE}`,
        committer: {
          name: `Contribution Graph Bot B/O ${variables.GITHUB_USER}`,
          email: `${variables.GITHUB_USER}@users.noreply.github.com`
        },
        content: base64,
        sha
      })
    }
  );

  const info = await response.json();

  console.log(info, `https://api.github.com/repos/${encodeURIComponent(variables.GITHUB_USER)}/${encodeURIComponent(variables.GITHUB_REPO)}/contents/${encodeURIComponent(variables.GITHUB_STATE_FILE)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `token ${variables.GITHUB_TOKEN}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Update ${variables.GITHUB_STATE_FILE}`,
        committer: {
          name: `Contribution Graph Bot B/O ${variables.GITHUB_USER}`,
          email: `${variables.GITHUB_USER}@users.noreply.github.com`
        },
        content: base64,
        sha
      })
    });

  Assert(!!info.content, 'Expected content details to be returned');
  Assert(!!info.commit, 'Expected commit details to be returned');
}

export const handler = async (event, context, cb) => {
  const variables = await getEnvironmentVariables(),
    { state, sha } = await getCurrentState(variables);

  await saveState(variables, state, sha);

  return {
    message: 'Complete'
  }
};

/**
 * @typedef {object} EnvVariables
 * @property {string} GITHUB_TOKEN
 * @property {string} GITHUB_USER
 * @property {string} GITHUB_REPO
 * @property {string} GITHUB_STATE_FILE
 */

/**
 * @typedef {object} ArtStateInfo
 * @property {ArtState} state
 * @property {string} sha
 */

/**
 * @typedef {object} ArtState
 *
 */