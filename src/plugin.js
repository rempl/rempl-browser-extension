import rempl from 'rempl/dist/rempl';
import { createIndicator, slice, genUID } from './helpers';

const DEBUG = false;
const inspectedWindow = chrome.devtools.inspectedWindow;
const debugIndicator = DEBUG ? createIndicator() : null;
let pageConnected = false;
let remplConnected = false;
let devtoolSession = null;
let selectedPublisher = null;
let publishers = [];
const callbacks = {};
const subscribers = createSubscribers();
let dropSandboxTimer;
let sandbox;
const page = chrome.runtime.connect({
    name: 'rempl:host'
});

const listeners = {
    connect: function() {
        pageConnected = true;
        updateIndicator();
    },
    'page:connect': function(sessionId, publishers_) {
        notify('session', [devtoolSession = sessionId]);
        notify('connection', [remplConnected = true]);
        publishers = publishers_;
        updateIndicator();
    },
    disconnect: function() {
        pageConnected = false;
        notify('connection', [remplConnected = false]);
        publishers = [];
        selectedPublisher = null;
        updateIndicator();
        dropSandboxTimer = setTimeout(dropSandbox, 3000);
    },
    endpoints: function(publishers_) {
        publishers = publishers_;

        if (selectedPublisher && publishers.indexOf(selectedPublisher) === -1) {
            selectedPublisher = null;
            dropSandbox();
        }

        updateIndicator();
    },
    data: function() {
        if (DEBUG) {
            console.log('[rempl][devtools plugin] recieve data', arguments); // eslint-disable-line no-console
        }

        notify('data', arguments);
    }
};

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
            'gray', // once disconnected
            'orange', // pageConnected but without a page
            'green' // all connected
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

function notify(type, args) {
    for (let i = 0; i < subscribers[type].length; i++) {
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
    sendToPage('endpoints', [selectedPublisher]);
    sendToPage('getRemoteUI', function(err, type, content) { // eslint-disable-line consistent-return
        hideLoading();

        if (err) {
            return sandboxError('Fetch UI error: ' + err);
        }

        sandbox = rempl.createSandbox({
            type: type,
            content: content
        }, function(api) {
            // TODO: use session
            if (DEBUG) {
                console.log(devtoolSession); // eslint-disable-line no-console
            }

            api.subscribe(function() {
                sendToPage.apply(null, ['data'].concat(slice(arguments)));
            });
            subscribers.data.push(api.send);
        });
        sandbox.setConnected(true);
    });
}

function dropSandbox() {
    clearTimeout(dropSandboxTimer);

    if (sandbox) {
        sandbox.destroy();
        sandbox = null;
    }
}

function sendToPage(type) {
    const args = slice(arguments, 1);
    let callback = false;

    if (args.length && typeof args[args.length - 1] === 'function') {
        callback = genUID();
        callbacks[callback] = args.pop();
    }

    if (DEBUG) {
        console.log('[rempl][devtools plugin] send data', callback, args); // eslint-disable-line no-console
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
        console.log('[rempl][devtools plugin] Recieve:', packet); // eslint-disable-line no-console
    }

    let args = packet.data;
    const callback = packet.callback;

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
                console.log('[rempl][devtools plugin] send callback', callback, args); // eslint-disable-line no-console
            }

            page.postMessage({
                type: 'callback',
                callback: callback,
                data: slice(arguments)
            });
        });
    }

    // filter packets for selected publisher only
    // TODO: remove it, when rempl would filter send requests on it own side
    if (packet.endpoint && packet.endpoint !== selectedPublisher) {
        return;
    }

    if (listeners.hasOwnProperty(packet.type)) {
        listeners[packet.type].apply(null, args);
    }
});

page.postMessage({
    type: 'plugin:init',
    tabId: inspectedWindow.tabId
});
