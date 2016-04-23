'use strict';
const REDDIT_APP_ID = 'Xt1ApJ4VuMj1vw';
const REDIRECT_URI = 'https://not-an-aardvark.github.io/reddit-thread-snapshots/authorize.html';

const USER_AGENT = 'reddit thread snapshots || https://github.com/not-an-aardvark/reddit-thread-snapshots';
const REQUIRED_SCOPES = ['read'];
const query = parseQueryString(window.location.search);
let fetchedContent;

const getRedirectString = state => `
https://reddit.com/api/v1/authorize
?client_id=${REDDIT_APP_ID}
&response_type=code
&state=${encodeURIComponent(state)}
&redirect_uri=${encodeURIComponent(REDIRECT_URI)}
&duration=temporary
&scope=${REQUIRED_SCOPES.join('%2C')}
`;

function redirectToAuth () {
  try {
    window.location = getRedirectString(getStateFromUrl(document.getElementById('thread-url').value));
  } catch (err) {
    console.error(err);
    document.getElementById('url-error-message').innerHTML = 'Failed to parse URL; please enter a valid link to a reddit submission or comment.';
  }
}

function getStateFromUrl(url) {
  const matches = url.match(/^(?:http(?:s?):\/\/)?(?:\w*\.)?reddit.com\/(?:r\/\w{1,21}\/)?comments\/(\w{1,10})(?:\/[\w\u00c0-\u017f]{1,100})?(?:\/(\w{1,10})|\/?)?(?:\?.*)?$/);
  if (!matches) {
    document.getElementById('url-error-message').innerHTML = 'Failed to parse URL; please enter a valid link to a reddit submission or comment.';
    throw new TypeError('Invalid URL');
  }
  return JSON.stringify(matches[2] ? {type: 'Comment', id: matches[2]} : {type: 'Submission', id: matches[1]});
}

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

let r;
function generateSnapshot (requestedThread) {
  document.getElementById('error-output') && (document.getElementById('error-output').innerHTML = '');
  (r ? Promise.resolve() : createRequester()).then(() => {
    const item = requestedThread.type === 'Comment' ? r.get_comment(requestedThread.id) : r.get_submission(requestedThread.id);
    return item.expand_replies();
  }).then(obj => {
    fetchedContent = obj;
    updateDisplay();
  });
}

function createRequester () {
  return snoowrap.request_handler.request.post({
    url: 'https://www.reddit.com/api/v1/access_token',
    auth: {user: REDDIT_APP_ID, pass: ''},
    form: {grant_type: 'authorization_code', code: query.code, redirect_uri: REDIRECT_URI}
  }).then(response => {
    if (!response.access_token) {
      throw new Error('Authentication failed');
    }
    r = new snoowrap({user_agent: USER_AGENT, access_token: response.access_token});
    r.config({debug: true});
    return null;
  }).catch(err => {
    document.getElementById('error-output').innerHTML = 'Sorry, something went wrong. Please check the dev console for further details.';
    throw err;
  });
}

function updateDisplay () {
  if (!fetchedContent) {
    return;
  }
  if (document.getElementById('lite-checkbox').checked) {
    document.getElementById('snapshot').innerHTML = JSON.stringify(recursivelyPickProps(fetchedContent.toJSON()), null, 4);
  } else {
    document.getElementById('snapshot').innerHTML = JSON.stringify(fetchedContent, null, 4);
  }
}

const LITE_KEY_NAMES = ['selftext', 'body', 'author', 'replies', 'comments'];

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

if (window.location.pathname.endsWith('/authorize.html')) {
  if (!query.code) {
    window.location = '.';
  }
  generateSnapshot(JSON.parse(query.state))
}
