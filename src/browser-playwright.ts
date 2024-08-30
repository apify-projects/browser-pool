import http from 'http';
import stream from 'stream';

import httpProxy from 'http-proxy';
import { BrowserServer, chromium } from 'playwright';
import { log } from 'apify';
import { parseReqParams } from './params.js';
import { getProxyConfiguration } from './proxies.js';

export class PlaywrightInstanceManager {
    private server: BrowserServer | undefined;
    private closureTimeout: NodeJS.Timeout | undefined;

    private async closeServer() {
        log.info('Browser server closed');
        await this.server?.close();
        this.server = undefined;
    }

    private async closeServerDelayed(delay?: number) {
        if (!delay) {
            await this.closeServer();
            return;
        }
        this.closureTimeout = setTimeout(this.closeServer, delay);
    }

    private cancelServerClosure() {
        log.info('Canceling browser server closure');
        clearTimeout(this.closureTimeout);
    }

    async spawnAndProxyBrowser(req: http.IncomingMessage, socket: stream.Duplex, head: Buffer) {
        this.cancelServerClosure();

        const launchOptions = parseReqParams(req.url ?? '/');

        log.info('Launching Playwright server', launchOptions);
        try {
            const proxy = await getProxyConfiguration({
                defaultProxy: launchOptions.proxy,
                groups: launchOptions.proxyGroups,
                countryCode: launchOptions.proxyCountry,
            });
            this.server = await chromium.launchServer({
                proxy,
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
        const wsEndpoint = this.server.wsEndpoint();

        socket.once('close', async () => {
            log.info('Socket closed, going to close browser server', { wsEndpoint, ttl: launchOptions.ttl });
            await this.closeServerDelayed(launchOptions.ttl);
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
                log.error('Error creating proxy, going to close browser server', { wsEndpoint, error, ttl: launchOptions.ttl });
                await this.closeServerDelayed(launchOptions.ttl);
            },
        );
    }
}
