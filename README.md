# Browser Pool

## What is Browser Pool?

Browser Pool is a tool that leverages the Apify platform and provides you with headless browsers for building AI agents.

## Why using Browser Pool?

Because it can rely on well tested features by Apify, such as proxies, which help to circumvent obstacles and let you concentrate on developing the online automation.

## How to use Browser Pool

1. Go to the *Standby* tab and copy the *Actor URL*.

2. Replace `https://` with `wss://`: you now have the URL for connecting your Playwright session to Apify through [CDP](https://chromedevtools.github.io/devtools-protocol/), which looks something like this:

```
wss://marco-gullo--browser-pool.apify.actor?token=$TOKEN
```

3. Finally, you can use the URL with Playwright. Let's say you want to generate and download the emoji of a *smiling rocket* on [emojikitchen.dev](https://emojikitchen.dev/):

```js
import fs from 'fs;
import { chromium } from 'playwright';

console.log('Connecting to a remote browser on the Apify platform');
const wsEndpoint = 'wss://marco-gullo--browser-pool.apify.actor?token=$TOKEN&other_params...';
const browser = await chromium.connect(wsEndpoint);

console.log('Browser connection established, creating context');
const context = await browser.newContext({ viewport: { height: 1000, width: 1600 } });

console.log('Opening new page');
const page = await context.newPage();

const timeout = 60_000;
console.log(`Going to: ${url}. Timeout = ${timeout}ms`);
await page.goto(url, { timeout });

console.log('Selecting emojis');
await page.getByRole('img', { name: 'rocket' }).first().click();
await page.getByRole('img', { name: 'smile', exact: true }).nth(1).click();

console.log('Saving screenshot');
const screenshot = await page.getByRole('img', { name: 'rocket-smile' }).screenshot();
fs.writeFileSync('rocket-smile.png', screenshot);

console.log('Closing the browser');
await context.close();
await browser.close();
```

This code is executed locally, and in the end you will have this nice picture on your computer:

![Rocket Smile](https://www.gstatic.com/android/keyboard/emojikitchen/20240206/u1f680/u1f680_u1f604.png)

Nevertheless, the browser runs on the Apify platform, so there is no need for you to install Chromium.\
Moreover, you can mock your location or try to circumvent blocks using Apify's proxies.
To do so, you need to use search parameters: see below.

### Search parameters

You can customize your session using search parameters.
They are designed to be compatible with [browserless.io](https://docs.browserless.io):

- `proxy`: either `datacenter` or `residential`; selects the corresponding default proxy groups.
- `proxyGroups`: stringified JSON of an array of Apify proxy groups, e.g., `["RESIDENTIAL5"]`.
- `proxyCountry`: [ISO 3166 country code](https://en.wikipedia.org/wiki/List_of_ISO_3166_country_codes#Current_ISO_3166_country_codes).
- `launch`: stringified JSON containing the following properties:
    - headless: either `true` or `false`, passed as [option to Playwright](https://playwright.dev/docs/api/class-testoptions#test-options-headless).
    - args: array of arguments to pass to Chromium, e.g., `["--window-size=1920,1080", "--lang=en-US"]`.
- `ignoreDefaultArgs`: either `true` or `false`, if true only uses the passed browser arguments.
- `timeout`: maximum allowed time to spawn the browser server, in milliseconds.
- `ttl`: time to live, in milliseconds, of the browser session after the socket has been closed.

For example, if you wanted to use Apify's residential proxies from the United States, your URL would look like this:

```
wss://marco-gullo--browser-pool.apify.actor?token=$TOKEN&proxy=residential&proxyCountry=us
```
