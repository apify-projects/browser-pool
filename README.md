# Browser Pool

A Standby Actor for providing a pool of on-demand browsers, accessible through CDP.

## How to use it

```js
const wsEndpoint = 'wss://$USERNAME--$ACTOR.apify.actor?token=$TOKEN&other_params...'
```

### Available parameters

The search parameters are designed to be compatible with [browserless.io](https://docs.browserless.io).

- `proxy`: either `datacenter` or `residential`; selects the corresponding default proxy groups.
- `proxyGroups`: stringified JSON of an array of Apify proxy groups, e.g., `["RESIDENTIAL5"]`.
- `proxyCountry`: [ISO 3166 country code](https://en.wikipedia.org/wiki/List_of_ISO_3166_country_codes#Current_ISO_3166_country_codes).
- `launch`: stringified JSON containing the following properties:
    - headless: either `true` or `false`, passed as [option to Playwright](https://playwright.dev/docs/api/class-testoptions#test-options-headless).
    - args: array of arguments to pass to Chromium, e.g., `["--window-size=1920,1080", "--lang=en-US"]`.
- `ignoreDefaultArgs`: either `true` or `false`, if true only uses the passed browser arguments.
- `timeout`: maximum allowed time to spawn the browser server, in milliseconds.
- `ttl`: time to live, in milliseconds, of the browser session after the socket has been closed.

TODO:

- `blockAds`: may use a browser extension.
- `launch.stealth`: may use Apify fingerprinting to avoid blocks.

TODO: implement the ability to set options using headers, to be compatible with [browserbase.com](https://www.browserbase.com/).

## TODO

- [x] Expose CDP-interface via Standby mode
- [ ] Run an auto-scaled pool of web browsers and provide access to them via CDP
- [ ] Pre-configure with our browser fingerprinting and proxies to reduce blocking

Bonus:

- [ ] Playwright - automatically select a client-matching version

## Support

- [x] Playwright - Chromium
- [ ] Playwright - Chrome
- [ ] Playwright - Firefox
- [ ] Playwright - WebKit
- [ ] Puppeteer - Chromium
- [ ] Puppeteer - Chrome
- [ ] Bare CDP - Chromium
- [ ] Bare CDP - Chrome
