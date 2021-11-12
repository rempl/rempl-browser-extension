const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const manifest = require('../src/manifest.js');

const { NODE_ENV } = process.env;
const watch = NODE_ENV !== 'production';

const indir = path.join(__dirname, '/../src');

const browsers = [
    'chrome',
    'firefox'
];

async function build(browser) {
    const outdir = path.join(__dirname, `/../build-${browser}`);

    fs.rmdirSync(outdir, { recursive: true });
    fs.mkdirSync(outdir, { recursive: true });
    fs.writeFileSync(outdir + '/manifest.json', manifest(browser));

    copyFiles(path.join(indir, 'img'), outdir);
    copyFiles(path.join(indir, 'index.html'), outdir);
    copyFiles(path.join(indir, 'plugin.html'), outdir);

    // build bundle
    const result = await esbuild.build({
        entryPoints: [
            path.join(indir, 'index.js'),
            path.join(indir, 'background.js'),
            path.join(indir, 'page.js'),
            path.join(indir, 'plugin.js')
        ],
        format: 'esm',
        bundle: true,
        minify: true,
        write: false,
        outdir,
        define: {
            global: 'window'
        },
        loader: {
            '.png': 'dataurl',
            '.svg': 'dataurl'
        }
    });

    result.outputFiles.forEach(file => fs.writeFileSync(file.path, file.contents));
}

const buildAll = async function() {
    console.log('Building bundles:'); // eslint-disable-line no-console

    for (const browser of browsers) {
        console.log(`  ${browser}...`); // eslint-disable-line no-console

        try {
            await build(browser);
        } catch (e) {
            if (!/esbuild/.test(e.stack)) {
                console.error(e); // eslint-disable-line no-console
            }

            return;
        }
    }

    console.log('  OK'); // eslint-disable-line no-console
};

(async function() {
    await buildAll();

    if (watch) {
        const lastChange = new Map();

        fs.watch(indir, { recursive: true }, function(_, fn) {
            const mtime = Number(fs.statSync(path.join(indir, fn)).mtime);

            // avoid build when file doesn't changed but event is received
            if (lastChange.get(fn) !== mtime) {
                lastChange.set(fn, mtime);
                buildAll();
            }
        });
    }
}());

function copyFiles(src, dest) {
    fs.mkdirSync(dest, { recursive: true });

    if (fs.statSync(src).isDirectory()) {
        fs.readdirSync(src).forEach(p =>
            copyFiles(path.join(src, p), path.join(dest, path.basename(src)))
        );
    } else {
        fs.copyFileSync(src, path.join(dest, path.basename(src)));
    }
}

