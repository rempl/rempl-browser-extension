var path = require('path');
var fs = require('fs');
var Zip = require('jszip');
var zip = new Zip();
var version = require('../package.json').version;
var outputFile = path.resolve(__dirname, '../rempl-' + version + '.zip');
var manifest = require('../manifest.json');

function addFile(relPath) {
    zip.file(relPath, fs.readFileSync(relPath));
}

function addFolder(relPath) {
    fs.readdirSync(relPath).forEach(function(filename) {
        var fullpath = path.join(relPath, filename);
        if (fs.statSync(fullpath).isDirectory()) {
            addFolder(fullpath);
        } else {
            addFile(fullpath);
        }
    });
}

addFolder('src');
addFile('node_modules/rempl/dist/rempl.js');

// add manifest file with update version from package.json
manifest['version'] = version.replace(/^(\d+\.\d+\.\d+).*/, '$1');
manifest['version_name'] = version;
zip.file('manifest.json', JSON.stringify(manifest, null, 2));

zip
    .generateNodeStream({ type: 'nodebuffer', streamFiles: true })
    .pipe(fs.createWriteStream(outputFile))
    .on('finish', function() {
        console.log('Write result in ' + outputFile);
    });
