'use strict';
/* global snoowrap */
const REDDIT_APP_ID = 'Xt1ApJ4VuMj1vw';
const REDIRECT_URI = 'https://not-an-aardvark.github.io/reddit-thread-snapshots/';

const USER_AGENT = 'reddit thread snapshots || https://github.com/not-an-aardvark/reddit-thread-snapshots';
const REQUIRED_SCOPES = ['read'];
const LITE_KEY_NAMES = ['selftext', 'body', 'author', 'url', 'id', 'replies', 'comments'];
let cachedRequester;
let refreshTokenPromise;
let currentSnapshotObject;

const query = parseQueryString(window.location.search);
const cookies = parseCookieString(document.cookie);

function parseQueryString (str) {
  if (!str) {
    return {};
  }
  const obj = {};
  const pieces = str.slice(1).split('&');
  for (let i = 0; i < pieces.length; i++) {
    const pair = pieces[i].split('=');
    obj[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
  }
  return obj;
}

function parseCookieString (cookieString) {
  const obj = {};
  const splitCookies = cookieString.split('; ');
  for (const i of splitCookies) {
    const pair = i.split('=');
    obj[pair[0]] = pair[1];
  }
  return obj;
}

const getAuthRedirect = state =>
`https://reddit.com/api/v1/authorize
?client_id=${REDDIT_APP_ID}
&response_type=code
&state=${state}
&redirect_uri=${encodeURIComponent(REDIRECT_URI)}
&duration=permanent
&scope=${REQUIRED_SCOPES.join('%2C')}
`;

function parseUrl (url) {
  const matches = url.match(/^(?:http(?:s?):\/\/)?(?:\w*\.)?reddit.com\/(?:r\/\w{1,21}\/)?comments\/(\w{1,10})(?:\/[\w\u00c0-\u017f]{1,100})?(?:\/(\w{1,10})|\/?)?(?:\?.*)?$/);
  if (!matches) {
    throw new TypeError('Invalid URL. Please enter the URL of a reddit Submission or Comment.');
  }
  return matches;
}

function fetchSnapshot (requester, urlMatches) {
  return (urlMatches[2] ? requester.get_comment(urlMatches[2]) : requester.get_submission(urlMatches[1])).expand_replies();
}

function getRefreshToken () {
  refreshTokenPromise = refreshTokenPromise || (cookies.refresh_token ? Promise.resolve(cookies.refresh_token) : Promise.resolve().then(() => {
    const tempSnoowrap = new snoowrap({user_agent: USER_AGENT, client_id: REDDIT_APP_ID, client_secret: '', refresh_token: ''});
    return tempSnoowrap.credentialed_client_request({
      method: 'post',
      uri: 'api/v1/access_token',
      form: {grant_type: 'authorization_code', code: query.code, redirect_uri: REDIRECT_URI}
    });
  }).then(response => {
    if (!response.refresh_token) {
      throw new Error('Authentication failed');
    }
    document.cookie = `refresh_token=${response.refresh_token}`;
    cookies.refresh_token = response.refresh_token;
    return response.refresh_token;
  }));
  return refreshTokenPromise;
}

function getRequester (refresh_token) {
  if (cachedRequester) {
    return cachedRequester;
  }
  cachedRequester = new snoowrap({user_agent: USER_AGENT, client_id: REDDIT_APP_ID, client_secret: '', refresh_token});
  cachedRequester.config({debug: true});
  return cachedRequester;
}

function recursivelyPickProps (obj) {
  if (typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(recursivelyPickProps);
  }
  const newObj = {};
  for (const i of LITE_KEY_NAMES) {
    if (obj.hasOwnProperty(i)) {
      newObj[i] = recursivelyPickProps(obj[i]);
    }
  }
  return newObj;
}

function parseSnapshot (snapshot, liteMode) {
  return liteMode ? JSON.stringify(recursivelyPickProps(snapshot.toJSON()), null, 4) : JSON.stringify(snapshot, null, 4);
}

function updateSnapshotDisplay () {
  const liteMode = document.getElementById('lite-checkbox').checked;
  document.getElementById('loading-message').style.display = 'none';
  document.getElementById('url-error-message').style.display = 'none';
  document.getElementById('snapshot').innerHTML = parseSnapshot(currentSnapshotObject, liteMode);
}

function createSnapshot (url) {
  let parsedUrl;
  try {
    parsedUrl = parseUrl(url);
  } catch (err) {
    document.getElementById('url-error-message').innerHTML = err.message;
    throw err;
  }
  document.getElementById('output-box').style.display = 'block';
  document.getElementById('loading-message').style.display = 'block';
  return getRefreshToken(query.code)
    .then(getRequester)
    .then(r => fetchSnapshot(r, parsedUrl))
    .then(snapshot => {
      currentSnapshotObject = snapshot;
    })
    .then(updateSnapshotDisplay)
    .catch(err => {
      document.getElementById('error-output').innerHTML = 'An unknown error occured. Check the dev console for more details.';
      throw err;
    });
}

function onSubmitClicked () {
  const url = document.getElementById('thread-url-box').value;
  if (cookies.refresh_token || query.code) {
    return createSnapshot(url);
  }
  window.location = getAuthRedirect(url);
}

document.addEventListener('DOMContentLoaded', () => {
  if (cookies.refresh_token || query.code) {
    getRefreshToken(query.code);
  }
  if (query.state) {
    const url = decodeURIComponent(query.state);
    document.getElementById('thread-url-box').value = url;
    createSnapshot(url);
  }
});
