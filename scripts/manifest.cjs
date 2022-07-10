const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');

module.exports = function (browser = 'chrome') {
    const manifest = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../src/manifest.json'), 'utf8')
    );

    manifest.version = packageJson.version;

    if (browser === 'firefox') {
        manifest.applications = {
            gecko: {
                id: 'rempl@exdis.me',
                strict_min_version: '57.0' // eslint-disable-line camelcase
            }
        };

        delete manifest.offline_enabled;

        // Minifest v3 is not supported in Firefox yet
        // TODO: remove following lines when migrate to v3
        manifest.manifest_version = 2;
        manifest.background = {
            scripts: [manifest.background.service_worker]
        };
    }

    return JSON.stringify(manifest, null, 4);
};
