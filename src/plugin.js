/* eslint-env browser */
/* global chrome, slice, genUID, createIndicator, rempl */

var DEBUG = false;
var inspectedWindow = chrome.devtools.inspectedWindow;
var debugIndicator = DEBUG ? createIndicator() : null;
var pageConnected = false;
var remplConnected = false;
var devtoolSession = null;
var selectedPublisher = null;
var publishers = [];
var callbacks = {};
var listeners;
var subscribers = createSubscribers();
var dropSandboxTimer;
var sandbox;
var page = chrome.extension.connect({
    name: 'rempl:host'
});
var remplScript = (function() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '../node_modules/rempl/dist/rempl.js', false);
    xhr.setRequestHeader('If-Modified-Since', new Date(0).toGMTString());
    xhr.send('');

    return xhr.status >= 200 && xhr.status < 400
        ? xhr.responseText
        : '';
})();

function $(id) {
    return document.getElementById(id);
}

function updateConnectionStateIndicator(id, state) {
    $(id).innerHTML = state ? 'OK' : 'pending...';
    $(id).className = 'state ' + (state ? 'ok' : 'pending');
}

function updateIndicator() {
    if (!selectedPublisher) {
        selectedPublisher = publishers[0] || null;
        if (selectedPublisher) {
            requestUI();
        }
    }

    updateConnectionStateIndicator('connection-to-page', pageConnected);
    updateConnectionStateIndicator('connection-to-rempl', remplConnected);
    updateConnectionStateIndicator('connection-to-publisher', selectedPublisher !== null);

    $('state-banner').style.display = pageConnected && remplConnected && selectedPublisher ? 'none' : 'block';

    if (DEBUG) {
        debugIndicator.style.background = [
            'gray',   // once disconnected
            'orange', // pageConnected but without a page
            'green'   // all connected
        ][pageConnected + remplConnected];
    }
}

function sandboxError(message) {
    $('error').style.display = 'block';
    $('error').innerHTML = message;
}

function showLoading() {
    $('error').style.display = 'none';
    $('loading').style.display = 'block';
}

function hideLoading() {
    $('loading').style.display = 'none';
}

function initSandbox(type, content, fn) {
    sandbox = document.createElement('iframe');
    sandbox.onload = fn;

    if (type === 'url') {
        sandbox.src = content;
    } else {
        sandbox.srcdoc = '<!doctype html>';
    }

    document.documentElement.appendChild(sandbox);
}

function notify(type, args) {
    for (var i = 0; i < subscribers[type].length; i++) {
        subscribers[type][i].apply(null, args);
    }
}

function createSubscribers() {
    return {
        data: [],
        session: [],
        connection: []
    };
}

function requestUI() {
    // send interface UI request
    // TODO: reduce reloads
    dropSandbox();
    showLoading();
    sendToPage('getRemoteUI', function(err, type, content) {
        hideLoading();

        if (err) {
            return sandboxError('Fetch UI error: ' + err);
        }

        initSandbox(type, content, function() {
            initUI(type, content);
        });
    });
}

function initUI(type, content) {
    // TODO: use session
    if (DEBUG) {
        console.log(devtoolSession);
    }

    rempl.initSandbox(sandbox.contentWindow, selectedPublisher, function(api) {
        api.subscribe(function() {
            sendToPage.apply(null, ['data'].concat(slice(arguments)));
        });
        subscribers.data.push(api.send);
        api.send({
            type: 'publisher:connect'
        });
    });

    if (type === 'script') {
        sandbox.contentWindow.eval(
            remplScript +
            '\n//# sourceURL=rempl.js'
        );
        sandbox.contentWindow.eval(
            content +
            '\n//# sourceURL=publisher-ui.js'
        );
    }
}

function dropSandbox() {
    clearTimeout(dropSandboxTimer);

    if (sandbox) {
        subscribers = createSubscribers();
        sandbox.parentNode.removeChild(sandbox);
        sandbox.setAttribute('srcdoc', '');
        sandbox.setAttribute('src', '');
        sandbox = null;
    }
}

function sendToPage(type) {
    var args = slice(arguments, 1);
    var callback = false;

    if (args.length && typeof args[args.length - 1] === 'function') {
        callback = genUID();
        callbacks[callback] = args.pop();
    }

    if (DEBUG) {
        console.log('[rempl][devtools plugin] send data', callback, args);
    }

    page.postMessage({
        type: type,
        endpoint: selectedPublisher,
        data: args,
        callback: callback
    });
}

page.onMessage.addListener(function(packet) {
    if (DEBUG) {
        console.log('[rempl][devtools plugin] Recieve:', packet);
    }

    var args = packet.data;
    var callback = packet.callback;

    if (packet.type === 'callback') {
        if (callbacks.hasOwnProperty(callback)) {
            callbacks[callback].apply(null, args);
            delete callbacks[callback];
        }
        return;
    }

    if (callback) {
        args = args.concat(function() {
            if (DEBUG) {
                console.log('[rempl][devtools plugin] send callback', callback, args);
            }

            page.postMessage({
                type: 'callback',
                callback: callback,
                data: slice(arguments)
            });
        });
    }

    if (listeners.hasOwnProperty(packet.type)) {
        listeners[packet.type].apply(null, args);
    }
});

listeners = {
    'connect': function() {
        pageConnected = true;
        updateIndicator();
    },
    'page:connect': function(sessionId, publishers_) {
        notify('session', [devtoolSession = sessionId]);
        notify('connection', [remplConnected = true]);
        publishers = publishers_;
        updateIndicator();
    },
    'disconnect': function() {
        pageConnected = false;
        notify('connection', [remplConnected = false]);
        publishers = [];
        selectedPublisher = null;
        updateIndicator();
        dropSandboxTimer = setTimeout(dropSandbox, 3000);
    },
    'publishers': function(publishers_) {
        publishers = publishers_;

        if (selectedPublisher && publishers.indexOf(selectedPublisher) === -1) {
            selectedPublisher = null;
            dropSandbox();
        }

        updateIndicator();
    },
    'data': function() {
        if (DEBUG) {
            console.log('[rempl][devtools plugin] recieve data', arguments);
        }

        notify('data', arguments);
    }
};

page.postMessage({
    type: 'plugin:init',
    tabId: inspectedWindow.tabId
});
