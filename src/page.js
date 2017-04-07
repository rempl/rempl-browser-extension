/* eslint-env browser */
/* global chrome, genUID, createIndicator */

var DEBUG = false;
var sessionId = genUID();
var pluginConnected = false;
var remplConnected = false;
var publishers = [];
var subscribers = [];
var debugIndicator = DEBUG ? createIndicator() : null;
var outputChannelId;
var name = 'rempl-browser-extension-host';
var connectTo = 'rempl-browser-extension-publisher';
var inputChannelId = name + ':' + genUID();

function updateIndicator() {
    if (debugIndicator) {
        debugIndicator.style.background = [
            'blue',   // once disconnected
            'orange', // pluginConnected but no a page
            'green'   // all connected
        ][pluginConnected + remplConnected];
    }
}

function sendToPlugin(event, data) {
    plugin.postMessage({
        type: event,
        data: data
    });
}

function emitPageEvent(channelId, payload) {
    if (DEBUG) {
        console.log('[rempl][content script] send to page', channelId, payload);
    }

    postMessage({
        from: inputChannelId,
        to: channelId,
        payload: payload
    }, '*');
}

function sendToPage(data) {
    emitPageEvent(outputChannelId, data);
}

function handshake(inited) {
    emitPageEvent(connectTo + ':connect', {
        initiator: name,
        inited: inited,
        endpoints: subscribers
    });
}

//
// set up transport
//

var plugin = chrome.runtime.connect({
    name: 'rempl:page'
});

plugin.onMessage.addListener(function(packet) {
    if (DEBUG) {
        console.log('[rempl][content script] from plugin', packet.type, packet);
    }

    switch (packet.type) {
        case 'connect':
            if (!pluginConnected && remplConnected) {
                sendToPlugin('page:connect', [sessionId, publishers]);
                sendToPage({
                    type: 'connect',
                    endpoints: subscribers
                });
            }

            pluginConnected = true;
            updateIndicator();

            break;

        case 'disconnect':
            if (pluginConnected && remplConnected) {
                sendToPage({
                    type: 'disconnect'
                });
            }

            pluginConnected = false;
            updateIndicator();
            break;

        case 'endpoints':
            subscribers = packet.data[0];
            sendToPage(packet);
            break;

        case 'getRemoteUI':
        case 'callback':
        case 'data':
            sendToPage(packet);
            break;

        default:
            console.warn('[rempl][content script] Unknown packet type: ' + packet.type);
    }
});

//
// connect to basis.js devpanel
//

addEventListener('message', function(e) {
    var data = e.data || {};
    var payload = data.payload || {};

    switch (data.to) {
        case name + ':connect':
            if (payload.initiator === connectTo) {
                onConnect(data.from, payload);
            }
            break;

        case inputChannelId:
            onData(payload);
            break;
    }
});

function onConnect(from, payload) {
    outputChannelId = from;

    if (!payload.inited) {
        handshake(true);
    }

    remplConnected = true;
    publishers = payload.endpoints;
    updateIndicator();

    if (pluginConnected) {
        sendToPlugin('page:connect', [sessionId, payload.endpoints || publishers]);
        sendToPage({
            type: 'connect',
            endpoints: subscribers
        });
    }
}

function onData(payload) {
    if (DEBUG) {
        console.log('[rempl][content script] page -> plugin', payload);
    }

    switch (payload.type) {
        case 'endpoints':
            publishers = payload.data[0];

            if (!pluginConnected) {
                return;
            }

            break;
    }

    plugin.postMessage(payload);
}

handshake(false);
