import {
    EventTransportChannelId,
    EventTransportConnectTo,
    EventTransportHandshakePayload,
    EventTransportMessage,
    EventTransportMessagePayload
} from 'rempl';
import { createIndicator, genUID } from './helpers';
import { BgToPageMessage, PageToPluginMessage } from './types';

const DEBUG = false;
const sessionId = genUID();
let pluginConnected = false;
let remplConnected = false;
let publishers: string[] = [];
let subscribers: string[] = [];
const debugIndicator = DEBUG ? createIndicator() : null;
const name = 'rempl-browser-extension-host';
const connectToName = 'rempl-browser-extension-publisher';
const inputChannelId: EventTransportChannelId = `${name}/${genUID()}`;
let outputChannelId: EventTransportChannelId | null = null;

const plugin = chrome.runtime.connect({
    name: 'rempl:page'
});

function updateIndicator() {
    if (debugIndicator) {
        debugIndicator.style.background = [
            'blue', // once disconnected
            'orange', // pluginConnected but no a page
            'green' // all connected
        ][Number(pluginConnected) + Number(remplConnected)];
    }
}

function sendToPlugin(message: PageToPluginMessage) {
    plugin.postMessage(message);
}

function emitPageEvent(to: EventTransportConnectTo, payload: EventTransportHandshakePayload): void;
function emitPageEvent(to: EventTransportChannelId, payload: EventTransportMessagePayload): void;
function emitPageEvent(to: EventTransportConnectTo | EventTransportChannelId, payload: any): void {
    if (DEBUG) {
        console.log('[rempl][content script] send to page', to, payload); // eslint-disable-line no-console
    }

    const message: EventTransportMessage = {
        from: inputChannelId,
        to,
        payload
    };

    postMessage(message, '*');
}

function sendToPage(data: EventTransportMessagePayload) {
    if (outputChannelId) {
        emitPageEvent(outputChannelId, data);
    }
}

function handshake(inited: boolean) {
    emitPageEvent(`${connectToName}:connect`, {
        type: 'handshake',
        initiator: name,
        inited,
        endpoints: subscribers
    });
}

//
// set up transport
//

plugin.onMessage.addListener((packet: BgToPageMessage) => {
    if (DEBUG) {
        console.log('[rempl][content script] from plugin', packet.type, packet); // eslint-disable-line no-console
    }

    switch (packet.type) {
        case 'connect':
            if (!pluginConnected && remplConnected) {
                sendToPlugin({
                    type: 'page:connect',
                    data: [sessionId, publishers]
                });
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
            // @ts-expect-error type
            console.warn('[rempl][content script] Unknown packet type: ' + packet.type); // eslint-disable-line no-console
    }
});

//
// listen message events
//

addEventListener('message', (e: MessageEvent<EventTransportMessage>) => {
    const data = e.data || {};
    const connectTo: EventTransportConnectTo = `${name}:connect`;

    switch (data.to) {
        case connectTo:
            if (data.payload.initiator === connectToName) {
                onConnect(data.from, data.payload);
            }
            break;

        case inputChannelId:
            onData(data.payload);
            break;
    }
});

function onConnect(from: EventTransportChannelId, payload: EventTransportHandshakePayload) {
    outputChannelId = from;

    if (!payload.inited) {
        handshake(true);
    }

    remplConnected = true;
    publishers = payload.endpoints;
    updateIndicator();

    if (pluginConnected) {
        sendToPlugin({
            type: 'page:connect',
            data: [sessionId, payload.endpoints || publishers]
        });
        sendToPage({
            type: 'connect',
            endpoints: subscribers
        });
    }
}

function onData(payload: EventTransportMessagePayload) {
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

    sendToPlugin(payload);
}

handshake(false);
