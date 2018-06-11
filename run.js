import Moment from 'moment';
import Art from './art';
import AWS from 'aws-sdk';
import Assert from 'assert';
import fetch from 'node-fetch';
import Cheerio from 'cheerio';

import 'moment-timezone';

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
  if (state.currentCommitsLeft === 0) {
    // Don't commit any changes today, we don't want any commits
    return null;
  }
  if (typeof state.currentCommitsLeft === 'number' && state.currentCommitsLeft > 0) {
    state.currentCommitsLeft -= 1;
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

  Assert(!!info.content, 'Expected content details to be returned');
  Assert(!!info.content.sha, 'Expected content sha to be returned');
  Assert(!!info.commit, 'Expected commit details to be returned');

  if (typeof state.currentCommitsLeft === 'number') {
    return saveState(variables, state, info.content.sha);
  }
}

/**
 * @param {EnvVariables} variables
 * @returns {Promise.<number>|number}
 */
async function getCurrentPositionFromContributionsGraph(variables) {
  const response = await fetch(
    `https://github.com/users/${variables.GITHUB_USER}/contributions`,
    {
      method: 'GET',
      headers: {
        Authorization: `token ${variables.GITHUB_TOKEN}`,
        Accept: 'text/html'
      }
    }
  );
  const html = await response.text();
  const $ = Cheerio.load(html);

  const dates = Array.from($('rect.day[data-date]')),
    inWeeks = dates.length / 7;

  // Remove all whole numbers using `- Math.floor(total)`
  // round to correct floating point issues
  return Math.round((inWeeks - Math.floor(inWeeks)) * 7)
}

/**
 * @param {ArtState} state
 * @param {Moment} currentTime
 */
function getCurrentPosition(state, currentTime) {
  const firstCycleMoment = Moment.tz(state.firstCycle, 'YYYY-MM-DD', state.firstCycleTimezone);

  const daysBetween = Math.abs(firstCycleMoment.diff(currentTime, 'days'));

  const totalDaysSinceStartOfFirstColumn = daysBetween + state.firstPosition;

  const totalWeeks = totalDaysSinceStartOfFirstColumn / 7;

  const currentColumn = Math.floor(totalWeeks);
  const currentRow = Math.round((totalWeeks - currentColumn) * 7);

  return {
    totalDaysSinceStartOfFirstColumn,
    totalWeeks,
    currentColumn,
    currentRow
  };
}

/**
 * @param {ArtPosition} position
 * @returns {Promise.<string>|string}
 */
function getCurrentMarker(position) {
  const rows = Art.split('\n');
  if (!rows[position.currentRow - 1]) {
    return ' ';
  }
  return rows[position.currentRow - 1][position.currentColumn] || ' ';
}

function getCommitsForMarker(marker) {
  const index = [
    ' ',
    '░',
    '▒',
    '▓',
    '█'
  ].indexOf(marker);
  return Math.max(0, index);
}

/**
 * @param {EnvVariables} variables
 * @param {ArtState} state
 * @returns {Promise.<void>}
 */
async function makeCommitsForDay(variables, state) {
  const currentTime = Moment.tz(Date.now(), variables.GITHUB_TIMEZONE),
    cycleFormat = 'YYYY-MM-DD';

  if (state.lastCycle === currentTime.format(cycleFormat)) {
    return null;
  }

  state.firstCycle = state.firstCycle || currentTime.format(cycleFormat);
  state.firstCycleTimezone = state.firstCycleTimezone || variables.GITHUB_TIMEZONE;
  state.firstPosition = state.firstPosition || await getCurrentPositionFromContributionsGraph(variables);

  state.lastCycle = currentTime.format(cycleFormat);
  state.lastCycleTimezone = variables.GITHUB_TIMEZONE;
  state.currentCycle = state.currentCycle || 0;
  state.currentCycle += 1;

  state.currentPosition = getCurrentPosition(state, currentTime);

  state.currentMarker = getCurrentMarker(state.currentPosition);

  state.currentCommitsLeft = getCommitsForMarker(state.currentMarker);
  state.initialCommitsForCycle = state.currentCommitsLeft;
}

export const handler = async (event, context, cb) => {
  const variables = await getEnvironmentVariables(),
    { state, sha } = await getCurrentState(variables);

  await makeCommitsForDay(variables, state);

  await saveState(variables, state, sha);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Complete',
      state
    })
  };
};

/**
 * @typedef {object} EnvVariables
 * @property {string} GITHUB_TOKEN
 * @property {string} GITHUB_USER
 * @property {string} GITHUB_REPO
 * @property {string} GITHUB_STATE_FILE
 * @property {string} GITHUB_TIMEZONE
 */

/**
 * @typedef {object} ArtStateInfo
 * @property {ArtState} state
 * @property {string} sha
 */

/**
 * @typedef {object} ArtState
 * @property {string} firstCycle
 * @property {string} firstCycleTimezone
 * @property {number} firstPosition
 * @property {string} lastCycle
 * @property {string} lastCycleTimezone
 * @property {number} lastPosition
 * @property {number} currentCycle
 * @property {ArtPosition} currentPosition
 * @property {string} currentMarker
 * @property {number} currentCommitsLeft
 * @property {number} initialCommitsForCycle
 */

/**
 * @typedef {object} ArtPosition
 * @property {number} totalDaysSinceStartOfFirstColumn
 * @property {number} totalWeeks
 * @property {number} currentColumn
 * @property {number} currentRow
 */