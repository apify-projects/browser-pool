## Parameters

- `blockAds`: may use a browser extension.
- `launch.stealth`: may use Apify fingerprinting to avoid blocks.

TODO: implement the ability to set options using headers, to be compatible with [browserbase.com](https://www.browserbase.com/).

## More TODO

- [x] Expose CDP-interface via Standby mode
- [ ] Run an auto-scaled pool of web browsers and provide access to them via CDP
- [ ] Pre-configure with our browser fingerprinting and proxies to reduce blocking

Bonus:

- [ ] Playwright - automatically select a client-matching version

## Browser support

- [x] Playwright - Chromium
- [ ] Playwright - Chrome
- [ ] Playwright - Firefox
- [ ] Playwright - WebKit
- [ ] Puppeteer - Chromium
- [ ] Puppeteer - Chrome
- [ ] Bare CDP - Chromium
- [ ] Bare CDP - Chrome
