import {
    BgToPageMessage,
    BgToPluginMessage,
    PageToPluginMessage,
    PluginToPageMessage
} from './types.js';

const PLUGIN_NAME_PREFIX = 'rempl:sandbox:';
const CONNECT_MESSAGE = { type: 'connect' } as const;
const DISCONNECT_MESSAGE = { type: 'disconnect' } as const;
const DEBUG = false;

type Connection = {
    page: chrome.runtime.Port | null;
    plugin: chrome.runtime.Port | null;
};

const connections = new Map<number, Connection>();

const logPrefix = '[rempl extension:background page]';
const debugLog = (...args: any[]) => console.log(logPrefix, ...args); // eslint-disable-line no-console
const debugWarn = (...args: any[]) => console.warn(logPrefix, ...args); // eslint-disable-line no-console

function getConnection(id: number) {
    let connection = connections.get(id);

    if (connection === undefined) {
        connections.set(
            id,
            (connection = {
                page: null,
                plugin: null
            })
        );
    }

    return connection;
}

function sendToPage(connection: Connection, payload: BgToPageMessage) {
    if (connection && connection.page) {
        DEBUG && debugLog('-> page', payload);

        connection.page.postMessage(payload);
    } else {
        DEBUG && debugWarn('-> page [not sent - no connection]', payload); // eslint-disable-line no-console
    }
}

function sendToPlugin(connection: Connection, payload: BgToPluginMessage) {
    if (connection && connection.plugin) {
        DEBUG && debugLog('-> plugin', payload); // eslint-disable-line no-console

        connection.plugin.postMessage(payload);
    } else {
        DEBUG && debugWarn('-> plugin [not sent - no connection]', payload); // eslint-disable-line no-console
    }
}

function connectPage(page: chrome.runtime.Port) {
    const tabId = page.sender?.tab?.id || 0;
    const connection = getConnection(tabId);

    connection.page = page;

    if (connection.plugin) {
        sendToPlugin(connection, CONNECT_MESSAGE);
        sendToPage(connection, CONNECT_MESSAGE);
    }

    page.onMessage.addListener((payload: PageToPluginMessage) => {
        DEBUG && debugLog('page -> plugin', payload); // eslint-disable-line no-console

        // proxy: page -> plugin
        sendToPlugin(connection, payload);
    });

    page.onDisconnect.addListener(() => {
        DEBUG && debugLog('page disconnect', tabId); // eslint-disable-line no-console

        connection.page = null;
        sendToPlugin(connection, DISCONNECT_MESSAGE);
    });
}

function connectPlugin(plugin: chrome.runtime.Port, tabId: number) {
    const connection = getConnection(tabId);

    connection.plugin = plugin;

    if (connection.page) {
        sendToPlugin(connection, CONNECT_MESSAGE);
        sendToPage(connection, CONNECT_MESSAGE);
    }

    plugin.onMessage.addListener((payload: PluginToPageMessage) => {
        DEBUG && debugLog('plugin -> page', payload); // eslint-disable-line no-console

        // proxy: plugin -> page
        sendToPage(connection, payload);
    });

    plugin.onDisconnect.addListener(() => {
        DEBUG && debugLog('plugin disconnect'); // eslint-disable-line no-console

        connection.plugin = null;
        sendToPage(connection, DISCONNECT_MESSAGE);
    });
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'rempl:page') {
        connectPage(port);
    }

    if (port.name.startsWith(PLUGIN_NAME_PREFIX)) {
        connectPlugin(port, Number(port.name.slice(PLUGIN_NAME_PREFIX.length)));
    }
});
