import http from 'http';
import { Actor, log } from 'apify';
import { chromium } from 'playwright';
import httpProxy from 'http-proxy';
import stream from 'stream'

await Actor.init();

async function spawnAndProxy(req: http.IncomingMessage, socket: stream.Duplex, head: Buffer) {
    const browserServer = await chromium.launchServer({ headless: false });
    const wsEndpoint = browserServer.wsEndpoint();

    socket.once('close', async () => {
        log.info('Socket closed, closing browser server', { wsEndpoint });
        await browserServer.close();
    });

    log.info('Spawned browser, creating proxy', { wsEndpoint });

    // If we don't do this, connection is refused with HTTP error 400 and socket error 1006
    delete req.headers.origin;
    req.url = '';

    const proxy = httpProxy.createProxyServer()
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
    )
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
    await spawnAndProxy(req, socket, head);
})
