import { createSandbox, Sandbox } from 'rempl';
import { createIndicator, genUID } from './helpers';
import {
    MessageArgsMap,
    MessageListenerMap,
    PageToPluginMessage,
    PluginToPageMessage
} from './types';

const DEBUG = false;
const inspectedWindow = chrome.devtools.inspectedWindow;
const debugIndicator = DEBUG ? createIndicator() : null;
let pageConnected = false;
let remplConnected = false;
let devtoolSession: string | null = null;
let selectedPublisher: string | null = null;
let publishers: string[] = [];
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

type PageToPluginMessageArgs = MessageArgsMap<PageToPluginMessage>;

const listeners: MessageListenerMap<PageToPluginMessage> = {
    connect() {
        pageConnected = true;
        updateIndicator();
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
    'page:connect'(sessionId, publishers_) {
        notify('session', (devtoolSession = sessionId));
        notify('connection', (remplConnected = true));
        publishers = publishers_;
        updateIndicator();
    },
    endpoints(publishers_) {
        publishers = publishers_;

        if (selectedPublisher && publishers.indexOf(selectedPublisher) === -1) {
            selectedPublisher = null;
            callbacks.clear();
            dropSandbox();
        }

        updateIndicator();
    },
    data(...args) {
        if (DEBUG) {
            console.log('[rempl][devtools plugin] recieve data', args); // eslint-disable-line no-console
        }

        notify('data', ...args);
    }
};

function $(id: string) {
    return document.getElementById(id) as HTMLElement;
}

function updateConnectionStateIndicator(id: string, state: boolean) {
    $(id).innerHTML = state ? 'OK' : 'pending...';
    $(id).className = 'state ' + (state ? 'ok' : 'pending');
}

function updateIndicator() {
    if (!selectedPublisher) {
        selectedPublisher = publishers[0] || null;
        callbacks.clear();
        if (selectedPublisher) {
            requestUI();
        }
    }

    updateConnectionStateIndicator('connection-to-page', pageConnected);
    updateConnectionStateIndicator('connection-to-rempl', remplConnected);
    updateConnectionStateIndicator('connection-to-publisher', selectedPublisher !== null);

    $('state-banner').style.display =
        pageConnected && remplConnected && selectedPublisher ? 'none' : 'block';

    if (DEBUG && debugIndicator) {
        debugIndicator.style.background = [
            'gray', // once disconnected
            'orange', // pageConnected but without a page
            'green' // all connected
        ][Number(pageConnected) + Number(remplConnected)];
    }
}

function sandboxError(message: string) {
    $('error').style.display = 'block';
    $('error').textContent = message;
}

function showLoading() {
    $('error').style.display = 'none';
    $('loading').style.display = 'block';
}

function hideLoading() {
    $('loading').style.display = 'none';
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

function requestUI() {
    // send interface UI request
    // TODO: reduce reloads
    dropSandbox();
    showLoading();
    sendToPage({ type: 'endpoints', data: [selectedPublisher ? [selectedPublisher] : []] });
    sendToPage({
        type: 'getRemoteUI',
        endpoint: selectedPublisher,
        data: [{}],
        callback: regCallback((err: string | null, type: string, content: string) => {
            hideLoading();

            if (err) {
                return sandboxError('Fetch UI error: ' + err);
            }

            sandbox = createSandbox({ type, content } as any, (api) => {
                // TODO: use session
                if (DEBUG) {
                    console.log(devtoolSession); // eslint-disable-line no-console
                }

                api.subscribe((...args: unknown[]) => {
                    const callback =
                        args.length > 0 && typeof args[args.length - 1] === 'function'
                            ? regCallback(args.pop() as (...args: unknown[]) => void)
                            : null;

                    sendToPage({
                        type: 'data',
                        endpoint: selectedPublisher,
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

page.onMessage.addListener((packet: PageToPluginMessage) => {
    if (DEBUG) {
        console.log('[rempl][devtools plugin] Recieve:', packet); // eslint-disable-line no-console
    }

    const type: keyof PageToPluginMessageArgs = packet.type;
    const args: PageToPluginMessageArgs[typeof type] =
        'data' in packet && Array.isArray(packet.data) ? packet.data : [];
    const callback = 'callback' in packet ? packet.callback : null;

    if (packet.type === 'callback') {
        if (callbacks.has(callback)) {
            callbacks.get(callback)(...args);
            callbacks.delete(callback);
        }

        return;
    }

    if (callback) {
        args.push((...data: unknown[]) => {
            if (DEBUG) {
                console.log('[rempl][devtools plugin] send callback', callback, data); // eslint-disable-line no-console
            }

            sendToPage({
                type: 'callback',
                data,
                callback
            });
        });
    }

    // filter packets for selected publisher only
    // TODO: remove it, when rempl would filter send requests on it own side
    const endpoint = 'endpoint' in packet ? packet.endpoint : null;
    if (endpoint !== selectedPublisher) {
        return;
    }

    if (listeners.hasOwnProperty(type)) {
        listeners[type]?.(...(args as any));
    }
});
