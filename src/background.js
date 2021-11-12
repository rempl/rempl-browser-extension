const DEBUG = false;
const connections = {};

function getConnection(id) {
    if (id in connections === false) {
        connections[id] = {
            page: null,
            plugin: null
        };
    }

    return connections[id];
}

function sendToPage(connection, payload) {
    if (connection && connection.page) {
        if (DEBUG) {
            console.log('-> page', payload); // eslint-disable-line no-console
        }

        connection.page.postMessage(payload);
    } else {
        if (DEBUG) {
            console.warn('-> page [not sent - no connection]', payload); // eslint-disable-line no-console
        }
    }
}

function sendToPlugin(connection, payload) {
    if (connection && connection.plugin) {
        if (DEBUG) {
            console.log('-> plugin', payload); // eslint-disable-line no-console
        }

        connection.plugin.postMessage(payload);
    } else {
        if (DEBUG) {
            console.warn('-> plugin [not sent - no connection]', payload); // eslint-disable-line no-console
        }
    }
}

function connectPage(page) {
    const tabId = page.sender.tab && page.sender.tab.id;
    const connection = getConnection(tabId);

    connection.page = page;

    if (connection.plugin) {
        sendToPlugin(connection, { type: 'connect' });
        sendToPage(connection, { type: 'connect' });
    }

    page.onMessage.addListener(function(payload) {
        if (DEBUG) {
            console.log('page -> plugin', payload); // eslint-disable-line no-console
        }

        // proxy: page -> plugin
        sendToPlugin(connection, payload);
    });

    page.onDisconnect.addListener(function() {
        if (DEBUG) {
            console.log('page disconnect', tabId); // eslint-disable-line no-console
        }

        connection.page = null;
        sendToPlugin(connection, { type: 'disconnect' });
    });
}

function connectPlugin(plugin) {
    let connection;

    plugin.onMessage.addListener(function(payload) {
        if (DEBUG) {
            console.log('plugin -> page', payload); // eslint-disable-line no-console
        }

        if (payload.type === 'plugin:init') {
            connection = getConnection(payload.tabId);
            connection.plugin = plugin;
            // connection.tabId = plugin.sender.tab && plugin.sender.tab.id;

            if (connection.page) {
                sendToPlugin(connection, { type: 'connect' });
                sendToPage(connection, { type: 'connect' });
            }

            return;
        }

        // proxy: plugin -> page
        sendToPage(connection, payload);
    });

    plugin.onDisconnect.addListener(function() {
        if (connection) {
            if (DEBUG) {
                console.log('plugin disconnect'); // eslint-disable-line no-console
            }

            connection.plugin = null;
            sendToPage(connection, { type: 'disconnect' });
        }
    });
}

chrome.runtime.onConnect.addListener(function(port) {
    if (port.name === 'rempl:page') {
        connectPage(port);
    }

    if (port.name === 'rempl:host') {
        connectPlugin(port);
    }
});
