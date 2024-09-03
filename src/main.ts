import http from 'http';
import stream from 'stream';

import { Actor, log } from 'apify';
import { connectSession, SessionManager } from './sessions.js';

await Actor.init();

const sessionManager = new SessionManager();
await sessionManager.init();

const port = Actor.config.get('standbyPort') || process.env.ACTOR_WEB_SERVER_PORT || 3000;

const server = http.createServer((req, res) => {
    log.info('HTTP request received', req.headers);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`Hello from Actor Standby! Build: ${Actor.getEnv().actorBuildNumber}\n`);
});

server.listen(port, () => log.info('Server is listening', { port }));

server.on('upgrade', async (req: http.IncomingMessage, socket: stream.Duplex, head: Buffer) => {
    log.info('WS request received', req.headers);
    await connectSession(sessionManager, req, socket, head);
});
