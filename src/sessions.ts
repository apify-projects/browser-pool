import { Actor, log } from 'apify';
import http from 'http';
import httpProxy from 'http-proxy';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import stream from 'stream';

import { getProxyConfiguration } from './proxies.js';
import { LaunchOptions, Session, SessionData, SessionType } from './types.js';
import { UnsupportedSessionError } from './errors.js';
import { parseLaunchOptions, parseSessionParams as parseRequestParams } from './request.js';
import { NODE_DEPENDENCIES } from './node.js';

const SESSION_DATA_RETENTION = 1000 * 60 * 60 * 24 * 7; // 1 week

export class SessionManager {
    // This duplication of information is necessary because only the serializable data is persisted.
    sessionsData: Record<string, SessionData> = {};
    sessions: Record<string, Session> = {};

    async init() {
        this.sessionsData = await Actor.useState('SESSIONS', this.sessionsData);
        const now = Date.now();
        for (const [sessionId, sessionData] of Object.entries(this.sessionsData)) {
            if (sessionData.endedAt && (now - sessionData.endedAt) > SESSION_DATA_RETENTION) {
                delete this.sessionsData[sessionId];
            }
            if (sessionData.status === 'RUNNING') {
                log.error('Found persisted running session: deleting it');
                delete this.sessionsData[sessionId];
            }
        }
        Actor.on('aborting', this.endAllSessions.bind(this));
        Actor.on('exit', this.endAllSessions.bind(this));
        Actor.on('migrating', this.endAllSessions.bind(this));
    }

    createSession(type: SessionType): string {
        const id = randomUUID();
        this.sessionsData[id] = { status: 'READY', type, browser: 'chromium', createdAt: Date.now() };
        return id;
    }

    async startSession(id: string, launchOptions: LaunchOptions): Promise<boolean> {
        const sessionData = this.sessionsData[id];
        if (!sessionData) {
            log.error('Cannot start session: not found', { id });
            return false;
        }

        switch (sessionData.type) {
            case 'playwright':
                try {
                    this.sessions[id] = {
                        server: await chromium.launchServer({
                            proxy: await getProxyConfiguration(sessionData.type, launchOptions),
                            headless: launchOptions.launch?.headless,
                            args: launchOptions.launch?.args,
                            ignoreDefaultArgs: launchOptions.ignoreDefaultArgs,
                            timeout: launchOptions.timeout,
                        }),
                    };
                } catch (e) {
                    log.exception(e as Error, 'Failed to launch server', { sessionType: sessionData.type, sessionId: id });
                    sessionData.status = 'ERROR';
                    return false;
                }
                sessionData.startedAt = Date.now();
                sessionData.status = 'RUNNING';
                break;
            default:
                throw new UnsupportedSessionError(sessionData.type);
        }

        sessionData.ttl = launchOptions.ttl;

        return true;
    }

    async endSession(id: string): Promise<boolean> {
        const sessionData = this.sessionsData[id];
        const session = this.sessions[id];
        if (!sessionData || !session) {
            log.error('Cannot end session: not found', { id });
            return false;
        }

        const endedAt = Date.now();

        switch (sessionData.type) {
            case 'playwright':
                try {
                    await session.server.close();
                    delete this.sessions[id];
                } catch (e) {
                    log.exception(e as Error, 'Failed to close server', { sessionType: sessionData.type, sessionId: id });
                    sessionData.status = 'ERROR';
                    return false;
                }
                break;
            default:
                throw new UnsupportedSessionError(sessionData.type);
        }

        sessionData.endedAt = endedAt;
        sessionData.status = 'COMPLETED';
        log.info('Session ended', { type: sessionData.type, id, endedAt });

        return true;
    }

    async endAllSessions() {
        await Promise.all(Object.keys(this.sessions).map((sessionId) => this.endSession(sessionId)));
    }

    async disconnectSession(id: string): Promise<boolean> {
        const sessionData = this.sessionsData[id];
        const session = this.sessions[id];
        if (!sessionData || !session) {
            log.error('Cannot disconnect session: not found', { id });
            return false;
        }

        if (sessionData.ttl) {
            sessionData.expiresAt = Date.now() + sessionData.ttl;
            log.info('Disconnected from session, setting timeout', {
                type: sessionData.type,
                id,
                timeout: sessionData.ttl,
                expiresAt: sessionData.expiresAt,
            });
            session.closureTimeout = setTimeout(() => this.endSession(id), sessionData.ttl);
        } else {
            log.info('Disconnected from session, ending', { type: sessionData.type, id });
            await this.endSession(id);
        }

        return true;
    }

    async connectSession(id: string, req: http.IncomingMessage, socket: stream.Duplex, head: Buffer): Promise<boolean> {
        const sessionData = this.sessionsData[id];
        const session = this.sessions[id];
        if (!sessionData || !session) {
            log.error('Cannot proxy session: not found, closing socket', { id });
            socket.end();
            return false;
        }
        if (sessionData.status !== 'RUNNING') {
            log.error('Trying to connect to a session which is not running', { type: sessionData.type, id });
            socket.end();
            return false;
        }

        if (session.closureTimeout) {
            log.info('Connection opened again: session timeout canceled', { type: sessionData.type, id });
            clearTimeout(session.closureTimeout);
            delete session.closureTimeout;
            delete sessionData.expiresAt;
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
        const session = sessionManager.sessionsData[launchOptions.sessionId];
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
        await sessionManager.connectSession(launchOptions.sessionId, req, socket, head);
        return;
    }

    const id = sessionManager.createSession(requestParams.type);
    const isStarted = await sessionManager.startSession(id, launchOptions);
    if (!isStarted) {
        log.error('Error starting session, disconnecting', { id });
        socket.end();
        return;
    }
    await sessionManager.connectSession(id, req, socket, head);
}
