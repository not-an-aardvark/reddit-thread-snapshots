'use strict';
/* global snoowrap */
var REDDIT_APP_ID = 'Xt1ApJ4VuMj1vw';
var REDIRECT_URI = 'https://not-an-aardvark.github.io/reddit-thread-snapshots/';

var USER_AGENT = 'reddit thread snapshots by /u/not_an_aardvark || https://github.com/not-an-aardvark/reddit-thread-snapshots';
var REQUIRED_SCOPES = ['read'];
var LITE_KEY_NAMES = ['selftext', 'body', 'author', 'url', 'id', 'replies', 'comments'];
var cachedRequester;
var accessTokenPromise;
var currentSnapshotObject;

var query = parseQueryString(location.search);
var cookies = parseCookieString(document.cookie);

function parseQueryString (str) {
  if (!str) {
    return {};
  }
  var obj = {};
  var pieces = str.slice(1).split('&');
  for (var i = 0; i < pieces.length; i++) {
    var pair = pieces[i].split('=');
    obj[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
  }
  return obj;
}

function parseCookieString (cookieString) {
  var obj = {};
  var splitCookies = cookieString.split('; ');
  splitCookies.forEach(function (cookie) {
    var pair = cookie.split('=');
    obj[pair[0]] = pair[1];
  });
  return obj;
}

var getAuthRedirect = function (state) {
  return `https://reddit.com/api/v1/authorize?client_id=${REDDIT_APP_ID}&response_type=code&state=${state}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&duration=temporary&scope=${REQUIRED_SCOPES.join('%2C')}`;
};

function parseUrl (url) {
  var matches = url.match(/^(?:http(?:s?):\/\/)?(?:\w*\.)?reddit\.com\/(?:r\/\w{1,21}\/)?comments\/(\w{1,10})(?:\/[^\/\?]{1,100})?(?:\/(\w{1,10})|\/?)?(?:\?.*)?$/);
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
    }).then(function (response) {
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
  var liteMode = document.getElementById('lite-checkbox').checked;
  document.getElementById('loading-message').style.display = 'none';
  document.getElementById('url-error-message').style.display = 'none';
  document.getElementById('snapshot').innerHTML = parseSnapshot(currentSnapshotObject, liteMode);
}

function createSnapshot (url) {
  var parsedUrl;
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
    .then(function (r) {
      return fetchSnapshot(r, parsedUrl);
    })
    .then(function (snapshot) {
      currentSnapshotObject = snapshot;
    })
    .then(updateSnapshotDisplay)
    .catch(function (err) {
      document.getElementById('error-output').innerHTML = 'An unknown error occured. Check the dev console for more details.';
      console.error(err); // eslint-disable-line no-console
      throw err;
    });
}

/* eslint-disable no-unused-vars */
function onSubmitClicked () {
  /* eslint-enable no-unused-vars */
  var url = document.getElementById('thread-url-box').value;
  if (cookies.access_token || query.code) {
    return createSnapshot(url);
  }
  location = getAuthRedirect(url);
}

document.addEventListener('DOMContentLoaded', function () {
  if (cookies.access_token || query.code) {
    getAccessToken(query.code);
  }
  if (query.state) {
    var url = decodeURIComponent(query.state);
    document.getElementById('thread-url-box').value = url;
    createSnapshot(url);
  }
});
