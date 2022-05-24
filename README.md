# [Rempl](https://github.com/rempl/rempl) host for browser's Developer Tools

[![Chrome Web Store](https://badgen.net/chrome-web-store/v/hcikjlholajopgbgfmmlbmifdfbkijdj)](https://chrome.google.com/webstore/detail/rempl/hcikjlholajopgbgfmmlbmifdfbkijdj)
[![Mozilla Addons](https://badgen.net/amo/v/rempl)](https://addons.mozilla.org/en-US/firefox/addon/rempl/)

This extension allows to load UI of tools built using [Rempl](https://github.com/rempl/rempl) in browser's devtools.

Download it from:

- [Chrome Web Store](https://chrome.google.com/webstore/detail/rempl/hcikjlholajopgbgfmmlbmifdfbkijdj)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/rempl/)
- [Releases](https://github.com/rempl/host-browser-extension/releases) page

> NOTE: Once Rempl extension is installed, its tab ("Rempl") should appear in browser's devtools. Make sure you reload a page using Rempl tools and re-opened (close and open again) browser's devtools as well.

![Rempl tab in browser's devtools](https://user-images.githubusercontent.com/270491/141767859-49510bc6-250b-4d52-af68-bceb4828ebfc.png)

## Development

- Run `npm install`
- Run `npm run dev`

In Chromium based browser:

- Enable `Developer mode` on `Extensions` (chrome://extensions) in Google Chrome
- Click `Load Unpacked Extension` and choose folder of extension
  > NOTE: To apply most changes you need to reload extension on `Extensions` page, reload page and browser's devtools

In Firefox:

- Navigate to `about:debugging`
- Click `This Firefox`
- Click `Load Temporary Add-on` and choose manifest of extension
  > NOTE: To apply most changes you need to reload extension on `Extensions` page, reload page and browser's devtools
