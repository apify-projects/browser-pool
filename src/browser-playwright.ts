import http from 'http';
import stream from 'stream';

import httpProxy from 'http-proxy';
import { BrowserServer, chromium } from 'playwright';
import { log } from 'apify';
import { parseReqParams } from './params.js';
import { getProxyConfiguration } from './proxies.js';

export async function spawnAndProxyPlaywrightBrowser(req: http.IncomingMessage, socket: stream.Duplex, head: Buffer) {
    const launchOptions = parseReqParams(req.url ?? '/');

    log.info('Launching Playwright server', launchOptions);
    let browserServer: BrowserServer;
    try {
        browserServer = await chromium.launchServer({
            proxy: await getProxyConfiguration({
                defaultProxy: launchOptions.proxy,
                groups: launchOptions.proxyGroups,
                countryCode: launchOptions.proxyCountry,
            }),
            headless: launchOptions.launch?.headless,
            args: launchOptions.launch?.args,
            ignoreDefaultArgs: launchOptions.ignoreDefaultPath,
            timeout: launchOptions.timeout,
        });
    } catch (e) {
        log.exception(e as Error, 'Error launching Playwright server');
        socket.end();
        return;
    }
    const wsEndpoint = browserServer.wsEndpoint();

    socket.once('close', async () => {
        log.info('Socket closed, closing browser server', { wsEndpoint });
        await browserServer.close();
    });

    log.info('Spawned browser, creating internal proxy', { wsEndpoint });

    // If we don't do this, connection is refused with HTTP error 400 and socket error 1006
    delete req.headers.origin;
    req.url = '';

    const proxy = httpProxy.createProxyServer();
    proxy.ws(
        req,
        socket,
        head,
        {
            changeOrigin: true,
            target: wsEndpoint,
            ws: true,
        },
        async (error) => {
            log.error('Error creating proxy, closing browser server', { wsEndpoint, error });
            await browserServer.close();
        },
    );
}
