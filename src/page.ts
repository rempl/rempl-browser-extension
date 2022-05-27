import {
    EventTransportChannelId,
    EventTransportConnectTo,
    EventTransportHandshakePayload,
    EventTransportMessage,
    EventTransportMessagePayload
} from 'rempl';
import { BgToPageMessage, PageToPluginMessage, PublisherInfo } from './types';
import { createIndicator, genUID } from './helpers';

type PublisherHub = {
    id: number;
    connected: boolean;
    channelId: EventTransportChannelId;
    publishers: PublisherInfo[];
};

const DEBUG = false;
const sessionId = genUID();
let pluginConnected = false;
let remplConnected = false;
let subscribers: PublisherInfo[] = [];
const debugIndicator = DEBUG ? createIndicator() : null;
const name = 'rempl-browser-extension-host';
const connectToName = 'rempl-browser-extension-publisher';
const inputChannelId: EventTransportChannelId = `${name}/${genUID()}`;
const publisherHubs = new Map<EventTransportChannelId, PublisherHub>();
const publishers = new Map<string, PublisherInfo>();

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

function sendToPage(channelId: EventTransportChannelId, data: EventTransportMessagePayload) {
    emitPageEvent(channelId, data);
}

function syncPublisherConnections() {
    const connectedPublishers = new Set(subscribers.map(({ id }) => id));

    for (const hub of publisherHubs.values()) {
        const { connected, channelId, publishers } = hub;
        const endpoints = publishers
            .map(({ id }) => id)
            .filter((id) => connectedPublishers.has(id));
        const shouldBeConnected = endpoints.length > 0;

        if (connected !== shouldBeConnected) {
            hub.connected = shouldBeConnected;
            if (shouldBeConnected) {
                sendToPage(channelId, {
                    type: 'connect',
                    endpoints
                });
            } else {
                sendToPage(channelId, {
                    type: 'disconnect'
                });
            }
        }
    }
}

function handshake(inited: boolean) {
    emitPageEvent(`${connectToName}:connect`, {
        type: 'handshake',
        initiator: name,
        inited,
        endpoints: []
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
                cancelPluginPublishersSync();
                syncPublisherConnections();
                sendToPlugin({
                    type: 'page:connect',
                    data: [sessionId, [...publishers.values()]]
                });
            }

            pluginConnected = true;
            updateIndicator();

            break;

        case 'disconnect':
            subscribers = [];
            pluginConnected = false;
            syncPublisherConnections();
            updateIndicator();
            break;

        case 'plugin:subscribers': {
            subscribers = packet.data[0];
            syncPublisherConnections();
            break;
        }

        case 'rempl': {
            const [channelId, payload] = packet.data;

            switch (payload.type) {
                case 'getRemoteUI':
                case 'callback':
                case 'data': {
                    sendToPage(channelId, payload);
                    break;
                }
            }

            break;
        }

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
                onPageConnect(data.from, data.payload);
            }
            break;

        case inputChannelId:
            onPageDataMessage(data.from, data.payload);
            break;
    }
});

let syncPluginPublishersScheduled: Promise<void> | null = null;
function schedulePluginPublishersSync() {
    if (!syncPluginPublishersScheduled) {
        const task = (syncPluginPublishersScheduled = Promise.resolve().then(() => {
            if (task === syncPluginPublishersScheduled) {
                sendToPlugin({
                    type: 'page:publishers',
                    data: [[...publishers.values()]]
                });
            }
        }));
    }
}
function cancelPluginPublishersSync() {
    syncPluginPublishersScheduled = null;
}

function updatePublisherHub(channelId: EventTransportChannelId, publisherNames: string[]) {
    const newPublishers = [];
    let publishersChanged = false;
    let publisherHub = publisherHubs.get(channelId);

    if (!publisherHub) {
        publisherHub = {
            id: publisherHubs.size,
            connected: false,
            channelId,
            publishers: []
        };

        publisherHubs.set(channelId, publisherHub);
    }

    for (const name of publisherNames) {
        const publisherId = `${publisherHub.id}:${name}`;
        let publisher = publishers.get(publisherId);

        if (!publisher) {
            publishersChanged = true;
            publishers.set(
                publisherId,
                (publisher = {
                    id: publisherId,
                    channelId,
                    name
                })
            );
        }

        newPublishers.push(publisher);
    }

    for (const publisher of publisherHub.publishers) {
        if (!newPublishers.includes(publisher)) {
            publishersChanged = true;
            publishers.delete(publisher.id);
        }
    }

    if (publishersChanged) {
        publisherHub.publishers = newPublishers;
        syncPublisherConnections();
        schedulePluginPublishersSync();
    }
}

function onPageConnect(from: EventTransportChannelId, payload: EventTransportHandshakePayload) {
    if (!payload.inited) {
        handshake(true);
    }

    remplConnected = true;
    updateIndicator();

    updatePublisherHub(from, payload.endpoints);

    if (pluginConnected) {
        cancelPluginPublishersSync();
        syncPublisherConnections();
        sendToPlugin({
            type: 'page:connect',
            data: [sessionId, [...publishers.values()]]
        });
    }
}

function onPageDataMessage(from: EventTransportChannelId, payload: EventTransportMessagePayload) {
    if (DEBUG) {
        console.log('[rempl][content script] page -> plugin', payload); // eslint-disable-line no-console
    }

    switch (payload.type) {
        case 'endpoints':
            updatePublisherHub(from, payload.data[0]);

            if (!pluginConnected) {
                return;
            }

            break;
    }

    sendToPlugin({
        type: 'rempl',
        data: [from, payload]
    });
}

handshake(false);
