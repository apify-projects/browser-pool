import http from 'http';
import stream from 'stream';

import { Actor, log } from 'apify';
import httpProxy from 'http-proxy';
import { chromium } from 'playwright';
import { version as serverPWVersion } from 'playwright/package.json';

await Actor.init();

async function spawnAndProxyPlaywrightBrowser(req: http.IncomingMessage, socket: stream.Duplex, head: Buffer) {
    const browserServer = await chromium.launchServer({
        headless: Actor.isAtHome(),
    });
    const wsEndpoint = browserServer.wsEndpoint();

    socket.once('close', async () => {
        log.info('Socket closed, closing browser server', { wsEndpoint });
        await browserServer.close();
    });

    log.info('Spawned browser, creating proxy', { wsEndpoint });

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

const port = Actor.config.get('standbyPort') || process.env.ACTOR_WEB_SERVER_PORT || 3000;

const server = http.createServer((req, res) => {
    log.info('Request received', req.headers);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`Hello from Actor Standby! Build: ${Actor.getEnv().actorBuildNumber}\n`);
});

server.listen(port, () => log.info('Server is listening', { port }));

server.on('upgrade', async (req: http.IncomingMessage, socket: stream.Duplex, head: Buffer) => {
    log.info('WS request', req.headers);

    const userAgent = req.headers['user-agent'];

    const isPlaywright = userAgent?.startsWith('Playwright') ?? false;
    if (!isPlaywright) {
        log.error('Currently, only Playwright is supported');
        socket.end();
        return;
    }

    const playwrightBrowser = req.headers['x-playwright-browser'];
    if (playwrightBrowser !== 'chromium') {
        log.error('Currently, only chromium is supported');
        socket.end();
        return;
    }

    const clientPWVersion = userAgent?.match(/^Playwright\/([\d.]+)/)?.at(-1);

    log.info('Playwright CDP connection', { serverPWVersion, clientPWVersion });
    await spawnAndProxyPlaywrightBrowser(req, socket, head);
});
