import { Actor, log } from 'apify';
import http from 'http';
import httpProxy from 'http-proxy';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import stream from 'stream';

import { getProxyConfiguration } from './proxies.js';
import { LaunchOptions, Session, SessionType } from './types.js';
import { UnsupportedSessionError } from './errors.js';
import { parseLaunchOptions, parseSessionParams as parseRequestParams } from './request.js';
import { NODE_DEPENDENCIES } from './node.js';

export class SessionManager {
    sessions = new Map<string, Session>();

    async init() {
        this.sessions = await Actor.useState('SESSIONS', this.sessions);
    }

    createSession(type: SessionType): string {
        const id = randomUUID();
        this.sessions.set(id, { id, status: 'READY', type, browser: 'chromium', createdAt: Date.now() });
        return id;
    }

    async startSession(id: string, launchOptions: LaunchOptions): Promise<boolean> {
        const session = this.sessions.get(id);
        if (!session) {
            log.error('Cannot start session: not found', { id });
            return false;
        }

        switch (session.type) {
            case 'playwright':
                try {
                    session.server = await chromium.launchServer({
                        proxy: await getProxyConfiguration(session.type, launchOptions),
                        headless: launchOptions.launch?.headless,
                        args: launchOptions.launch?.args,
                        ignoreDefaultArgs: launchOptions.ignoreDefaultArgs,
                        timeout: launchOptions.timeout,
                    });
                } catch (e) {
                    log.exception(e as Error, 'Failed to launch server', { sessionType: session.type, sessionId: session.id });
                    session.status = 'ERROR';
                    return false;
                }
                session.startedAt = Date.now();
                session.status = 'RUNNING';
                break;
            default:
                throw new UnsupportedSessionError(session.type);
        }

        session.ttl = launchOptions.ttl;

        return true;
    }

    async endSession(id: string): Promise<boolean> {
        const session = this.sessions.get(id);
        if (!session) {
            log.error('Cannot end session: not found', { id });
            return false;
        }
        if (!session.server) {
            log.error('Cannot end session: server is undefined', { type: session.type, id });
            return false;
        }

        const endedAt = Date.now();

        switch (session.type) {
            case 'playwright':
                try {
                    await session.server.close();
                } catch (e) {
                    log.exception(e as Error, 'Failed to close server', { sessionType: session.type, sessionId: session.id });
                    session.status = 'ERROR';
                    return false;
                }
                break;
            default:
                throw new UnsupportedSessionError(session.type);
        }

        session.endedAt = endedAt;
        session.status = 'COMPLETED';
        log.info('Session ended', { type: session.type, id, endedAt });

        return true;
    }

    async disconnectSession(id: string): Promise<boolean> {
        const session = this.sessions.get(id);
        if (!session) {
            log.error('Cannot disconnect session: not found', { id });
            return false;
        }

        if (session.ttl) {
            session.expiresAt = Date.now() + session.ttl;
            log.info('Disconnected from session, setting timeout', {
                type: session.type,
                id,
                timeout: session.ttl,
                expiresAt: session.expiresAt,
            });
            session.closureTimeout = setTimeout(() => this.endSession(id), session.ttl);
        } else {
            log.info('Disconnected from session, ending', { type: session.type, id });
            await this.endSession(id);
        }

        return true;
    }

    async proxySession(id: string, req: http.IncomingMessage, socket: stream.Duplex, head: Buffer): Promise<boolean> {
        const session = this.sessions.get(id);
        if (!session) {
            log.error('Cannot proxy session: not found, closing socket', { id });
            socket.end();
            return false;
        }
        if (session.status !== 'RUNNING') {
            log.error('Trying to connect to a session which is not running', { type: session.type, id });
            socket.end();
            return false;
        }
        if (!session.server) {
            log.error('Cannot proxy session: server is undefined', { type: session.type, id });
            return false;
        }

        if (session.closureTimeout) {
            log.info('Connection opened again: session timeout canceled', { type: session.type, id });
            clearTimeout(session.closureTimeout);
            delete session.closureTimeout;
            delete session.expiresAt;
        }

        const wsEndpoint = session.server.wsEndpoint();

        socket.once('close', () => this.disconnectSession(id));

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
                log.error('Error creating proxy to session, disconnecting', { id, error });
                socket.end();
            },
        );

        return true;
    }
}

export async function connectSession(
    sessionManager: SessionManager,
    req: http.IncomingMessage,
    socket: stream.Duplex,
    head: Buffer,
) {
    const launchOptions = parseLaunchOptions(req);
    const requestParams = parseRequestParams(req);
    if (!requestParams) {
        log.error('Error parsing session parameters, disconnecting');
        socket.end();
        return;
    }

    if (requestParams.type === 'playwright') {
        if (!requestParams.playwrightBrowser) {
            log.error('Error parsing playwright browser, disconnecting');
            socket.end();
            return;
        }
        log.info('Playwright CDP connection', {
            serverVersion: NODE_DEPENDENCIES.playwright ?? null,
            clientVersion: requestParams.playwrightVersion ?? null,
        });
    }

    if (launchOptions.sessionId) {
        const session = sessionManager.sessions.get(launchOptions.sessionId);
        if (!session) {
            log.error('Session not found', { id: launchOptions.sessionId });
            socket.end();
            return;
        }
        if (requestParams.type !== session.type) {
            log.error('Cannot resume a session changing type', {
                sessionType: session.type,
                requestType: requestParams.type,
            });
            socket.end();
            return;
        }
        if (requestParams.type === 'playwright' && requestParams.playwrightBrowser !== session.browser) {
            log.error('Cannot resume a Playwright session changing browser', {
                sessionBrowser: session.browser,
                requestBrowser: requestParams.playwrightBrowser,
            });
            socket.end();
            return;
        }
        await sessionManager.proxySession(launchOptions.sessionId, req, socket, head);
        return;
    }

    const id = sessionManager.createSession(requestParams.type);
    const isStarted = await sessionManager.startSession(id, launchOptions);
    if (!isStarted) {
        log.error('Error starting session, disconnecting', { id });
        socket.end();
        return;
    }
    await sessionManager.proxySession(id, req, socket, head);
}
