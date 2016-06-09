'use strict';
/* global snoowrap */
const REDDIT_APP_ID = 'Xt1ApJ4VuMj1vw';
const REDIRECT_URI = 'https://not-an-aardvark.github.io/reddit-thread-snapshots/';

const USER_AGENT = 'reddit thread snapshots by /u/not_an_aardvark || https://github.com/not-an-aardvark/reddit-thread-snapshots';
const REQUIRED_SCOPES = ['read'];
const LITE_KEY_NAMES = ['selftext', 'body', 'author', 'url', 'id', 'replies', 'comments'];
let cachedRequester;
let accessTokenPromise;
let currentSnapshotObject;

const query = parseQueryString(location.search);
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
  splitCookies.forEach(cookie => {
    const pair = cookie.split('=');
    obj[pair[0]] = pair[1];
  });
  return obj;
}

const getAuthRedirect = state =>
`https://reddit.com/api/v1/authorize
?client_id=${REDDIT_APP_ID}
&response_type=code
&state=${state}
&redirect_uri=${encodeURIComponent(REDIRECT_URI)}
&duration=temporary
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

function getAccessToken () {
  if (accessTokenPromise) {
    return accessTokenPromise;
  }
  accessTokenPromise = cookies.access_token
    ? Promise.resolve(cookies.access_token)
    : snoowrap.prototype.credentialed_client_request.call({
      user_agent: USER_AGENT,
      client_id: REDDIT_APP_ID,
      client_secret: ''
    }, {
      method: 'post',
      url: 'https://www.reddit.com/api/v1/access_token',
      form: {grant_type: 'authorization_code', code: query.code, redirect_uri: REDIRECT_URI}
    }).then(response => {
      if (!response.access_token) {
        throw new Error('Authentication failed');
      }
      document.cookie = `access_token=${response.access_token}; max-age=3600; secure`;
      cookies.access_token = response.access_token;
      return response.access_token;
    });
  return accessTokenPromise;
}

function getRequester (access_token) {
  if (cachedRequester) {
    return cachedRequester;
  }
  cachedRequester = new snoowrap({user_agent: USER_AGENT, access_token});
  cachedRequester.config({debug: true});
  return cachedRequester;
}

function parseSnapshot (snapshot, liteMode) {
  return JSON.stringify(snapshot, liteMode ? LITE_KEY_NAMES : null, 4);
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
  return getAccessToken(query.code)
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

/* eslint-disable no-unused-vars */
function onSubmitClicked () {
  /* eslint-enable no-unused-vars */
  const url = document.getElementById('thread-url-box').value;
  if (cookies.access_token || query.code) {
    return createSnapshot(url);
  }
  location = getAuthRedirect(url);
}

document.addEventListener('DOMContentLoaded', () => {
  if (cookies.access_token || query.code) {
    getAccessToken(query.code);
  }
  if (query.state) {
    const url = decodeURIComponent(query.state);
    document.getElementById('thread-url-box').value = url;
    createSnapshot(url);
  }
});
