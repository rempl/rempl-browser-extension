# [Rempl](https://github.com/rempl/rempl) host for Chromium Developer Tools

Install plugin through Chrome Web Store – [Rempl](https://chrome.google.com/webstore/detail/rempl/hcikjlholajopgbgfmmlbmifdfbkijdj)

## Development

- run `npm i`
- enable `Developer mode` on `Extensions` (chrome://extensions) in Google Chrome
- click `Load Unpacked Extension` and choose folder of extension

## Publishing

- change the version in `package.json`
- run `npm run build`
- file with name `rempl-[version].zip` should appear in folder
- load file into Chrome Web Store
