import {
    createSandbox,
    EventTransportChannelId,
    EventTransportMessagePayload,
    Sandbox
} from 'rempl';
import { createIndicator, genUID } from './helpers';
import {
    BgToPluginMessage,
    MessageListenerMap,
    PageToPluginMessage,
    PluginToPageMessage,
    PublisherInfo
} from './types';

const DEBUG = false;
const inspectedWindow = chrome.devtools.inspectedWindow;
const debugIndicator = DEBUG ? createIndicator() : null;
let pageConnected = false;
let remplConnected = false;
let devtoolSession: string | null = null;
let publishers: PublisherInfo[] = [];
let selectedPublisher: PublisherInfo | null = null;
const callbacks = new Map();
const subscribers = createSubscribers();
let dropSandboxTimer: ReturnType<typeof setTimeout>;
let sandbox: Sandbox | null = null;
const page = chrome.runtime.connect({
    name: `rempl:sandbox:${inspectedWindow.tabId}`
});

type SubscribeArgsMap = {
    data: unknown[];
    session: [session: string];
    connection: [connected: boolean];
};
type SubscribeMap = {
    [K in keyof SubscribeArgsMap]: Array<(...args: SubscribeArgsMap[K]) => void>;
};

const listeners: MessageListenerMap<BgToPluginMessage> = {
    connect() {
        pageConnected = true;
        updateIndicator();
        clearTimeout(dropSandboxTimer);
    },
    disconnect() {
        pageConnected = false;
        notify('connection', (remplConnected = false));
        publishers = [];
        selectedPublisher = null;
        callbacks.clear();
        updateIndicator();
        dropSandboxTimer = setTimeout(dropSandbox, 3000);
    },
    'page:connect'(sessionId, newPublishers) {
        notify('session', (devtoolSession = sessionId));
        notify('connection', (remplConnected = true));
        updatePublishers(newPublishers);
        updateIndicator();
    },
    'page:publishers'(newPublishers) {
        updatePublishers(newPublishers);
        updateIndicator();
    },
    rempl(channelId, payload) {
        const endpoint = 'endpoint' in payload ? payload.endpoint : null;

        // Filter messages for selected publisher only. This is necessary to make sure
        // that a message riched the correct publisher get, since a message might be sent
        // before a selected provider changed.
        if (
            selectedPublisher === null ||
            selectedPublisher.channelId !== channelId ||
            (endpoint !== null && selectedPublisher.name !== endpoint)
        ) {
            return;
        }

        switch (payload.type) {
            case 'callback': {
                const { callback, data: args } = payload;

                if (callbacks.has(callback)) {
                    callbacks.get(callback)(...args);
                    callbacks.delete(callback);
                }

                break;
            }

            case 'data': {
                const { callback, data: args } = payload;
                const channelId = selectedPublisher.channelId;

                if (callback) {
                    args.push((...data: unknown[]) => {
                        if (DEBUG) {
                            console.log('[rempl][devtools plugin] send callback', callback, data); // eslint-disable-line no-console
                        }

                        sendRemplMessageToPage(channelId, {
                            type: 'callback',
                            data,
                            callback
                        });
                    });
                }

                if (DEBUG) {
                    console.log('[rempl][devtools plugin] recieve data', payload); // eslint-disable-line no-console
                }

                notify('data', ...args);
                break;
            }
        }
    }
};

function $(id: string) {
    return document.getElementById(id) as HTMLElement;
}

function updateConnectionStateIndicator(id: string, state: boolean) {
    $(id).innerHTML = state ? 'OK' : 'Awaiting...';
    $(id).className = 'state ' + (state ? 'ok' : 'pending');
}

function updateIndicator() {
    const ready = !pageConnected || !remplConnected || !selectedPublisher;

    updateConnectionStateIndicator('connection-to-page', pageConnected);
    updateConnectionStateIndicator('connection-to-rempl', remplConnected);
    updateConnectionStateIndicator('connection-to-publisher', selectedPublisher !== null);

    $('state-banner').hidden = !ready;
    $('main').hidden = ready;

    if (DEBUG && debugIndicator) {
        debugIndicator.style.background = [
            'gray', // once disconnected
            'orange', // pageConnected but without a page
            'green' // all connected
        ][Number(pageConnected) + Number(remplConnected)];
    }
}

function renderPublisherTabs(publishers: PublisherInfo[]) {
    const tabsEl = $('publisher-tabs');

    tabsEl.innerHTML = '';

    for (const publisher of publishers) {
        const tabEl = document.createElement('div');

        tabEl.className = 'tab';
        tabEl.dataset.publisherId = publisher.id;
        tabEl.textContent = publisher.name;
        tabEl.addEventListener('click', () => setSelectedPublisher(publisher));

        tabsEl.append(tabEl);
    }
}

function updateSelectedPublisherTab() {
    const tabsEl = $('publisher-tabs');

    for (const tabEl of [...tabsEl.children] as HTMLElement[]) {
        tabEl.classList.toggle('tab_selected', tabEl.dataset.publisherId === selectedPublisher?.id);
    }
}

function sandboxError(message: string) {
    $('error').hidden = false;
    $('error').textContent = message;
}

function showLoadingUI() {
    $('error').hidden = true;
    $('loading-ui').hidden = false;
}

function hideLoadingUI() {
    $('loading-ui').hidden = true;
}

function notify<K extends keyof SubscribeArgsMap>(type: K, ...args: SubscribeArgsMap[K]) {
    for (let i = 0; i < subscribers[type].length; i++) {
        subscribers[type][i](...args);
    }
}

function createSubscribers(): SubscribeMap {
    return {
        data: [],
        session: [],
        connection: []
    };
}

function regCallback(callback: (...args: any[]) => void) {
    const callbackId = genUID();
    callbacks.set(callbackId, callback);
    return callbackId;
}

function requestUI(publisher: PublisherInfo) {
    // send interface UI request
    // TODO: reduce reloads
    dropSandbox();
    showLoadingUI();
    sendToPage({
        type: 'plugin:subscribers',
        data: [[publisher]]
    });
    sendRemplMessageToPage(publisher.channelId, {
        type: 'getRemoteUI',
        endpoint: publisher.name,
        data: [{}],
        callback: regCallback((err: string | null, type: string, content: string) => {
            hideLoadingUI();

            if (err) {
                return sandboxError('Fetch UI error: ' + err);
            }

            sandbox = createSandbox({ type, content, container: $('sandbox') } as any, (api) => {
                // TODO: use session
                if (DEBUG) {
                    console.log(devtoolSession); // eslint-disable-line no-console
                }

                api.subscribe((...args: unknown[]) => {
                    const callback =
                        args.length > 0 && typeof args[args.length - 1] === 'function'
                            ? regCallback(args.pop() as (...args: unknown[]) => void)
                            : null;

                    sendRemplMessageToPage(publisher.channelId, {
                        type: 'data',
                        endpoint: publisher.name,
                        data: args,
                        callback
                    });
                });
                subscribers.data.push(api.send);
            });
            sandbox.setConnected(true);
        })
    });
}

function setSelectedPublisher(publisher: PublisherInfo | null) {
    if (publisher?.id === selectedPublisher?.id) {
        return;
    }

    if (selectedPublisher !== null) {
        selectedPublisher = null;
        callbacks.clear();
        dropSandbox();
    }

    if (publisher !== null) {
        selectedPublisher = publisher;
        requestUI(selectedPublisher);
    }

    updateSelectedPublisherTab();
    updateIndicator();
}

function updatePublishers(newPublishers: PublisherInfo[]) {
    const prevSelectedPublisherId = selectedPublisher?.id || null;
    let newSelectedPublisher = selectedPublisher;

    publishers = newPublishers;

    if (publishers.every(({ id }) => id !== prevSelectedPublisherId)) {
        newSelectedPublisher = null;
    }

    if (newSelectedPublisher === null && publishers.length > 0) {
        newSelectedPublisher = publishers[0];
    }

    renderPublisherTabs(publishers);
    setSelectedPublisher(newSelectedPublisher);
}

function dropSandbox() {
    clearTimeout(dropSandboxTimer);

    if (sandbox) {
        sandbox.destroy();
        sandbox = null;
    }
}

function sendToPage(message: PluginToPageMessage) {
    if (DEBUG) {
        console.log('[rempl][devtools plugin] send data', message); // eslint-disable-line no-console
    }

    page.postMessage(message);
}

function sendRemplMessageToPage(
    channelId: EventTransportChannelId,
    payload: EventTransportMessagePayload
) {
    sendToPage({
        type: 'rempl',
        data: [channelId, payload]
    });
}

page.onMessage.addListener((packet: PageToPluginMessage) => {
    if (DEBUG) {
        console.log('[rempl][devtools plugin] Recieve:', packet); // eslint-disable-line no-console
    }

    const type = packet.type;
    const args = packet.data || [];

    if (listeners.hasOwnProperty(type)) {
        listeners[type]?.(...(args as any));
    }
});
