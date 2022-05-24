import { createIndicator, genUID } from './helpers';

const DEBUG = false;
const sessionId = genUID();
let pluginConnected = false;
let remplConnected = false;
let publishers = [];
let subscribers = [];
const debugIndicator = DEBUG ? createIndicator() : null;
let outputChannelId;
const name = 'rempl-browser-extension-host';
const connectTo = 'rempl-browser-extension-publisher';
const inputChannelId = name + ':' + genUID();

const plugin = chrome.runtime.connect({
    name: 'rempl:page'
});

function updateIndicator() {
    if (debugIndicator) {
        debugIndicator.style.background = [
            'blue', // once disconnected
            'orange', // pluginConnected but no a page
            'green' // all connected
        ][pluginConnected + remplConnected];
    }
}

function sendToPlugin(event, data) {
    plugin.postMessage({
        type: event,
        data
    });
}

function emitPageEvent(channelId, payload) {
    if (DEBUG) {
        console.log('[rempl][content script] send to page', channelId, payload); // eslint-disable-line no-console
    }

    postMessage(
        {
            from: inputChannelId,
            to: channelId,
            payload
        },
        '*'
    );
}

function sendToPage(data) {
    emitPageEvent(outputChannelId, data);
}

function handshake(inited) {
    emitPageEvent(connectTo + ':connect', {
        initiator: name,
        inited,
        endpoints: subscribers
    });
}

//
// set up transport
//

plugin.onMessage.addListener(function (packet) {
    if (DEBUG) {
        console.log('[rempl][content script] from plugin', packet.type, packet); // eslint-disable-line no-console
    }

    console.log('FROM PLUGIN', packet);

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
            console.warn('[rempl][content script] Unknown packet type: ' + packet.type); // eslint-disable-line no-console
    }
});

//
// connect to basis.js devpanel
//

addEventListener('message', function (e) {
    const data = e.data || {};
    const payload = data.payload || {};

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
        console.log('[rempl][content script] page -> plugin', payload); // eslint-disable-line no-console
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
