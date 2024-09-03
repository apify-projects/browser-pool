import { BrowserServer } from 'playwright';

export type DefaultProxy = 'datacenter' | 'residential'

export interface PlaywrightProxyConfiguration {
    server: string;
    bypass?: string;
    username?: string;
    password?: string;
}

export type ProxyConfiguration = PlaywrightProxyConfiguration

/**
 * Aims to be compatible with:
 * - https://docs.browserless.io/chrome-flags/
 * - https://docs.browserbase.com/reference/api/connect
 */
export interface LaunchOptions {
    sessionId?: string
    enableProxy?: boolean
    proxy?: DefaultProxy
    proxyGroups?: string[]
    proxyCountry?: string
    // TODO: blockAds?: boolean
    launch?: {
        // TODO: stealth?: boolean
        headless?: boolean
        args?: string[]
    }
    ignoreDefaultArgs?: boolean
    timeout?: number
    ttl?: number
}

export type SessionType = 'playwright'

export interface RequestParams {
    type: SessionType
    playwrightBrowser?: string
    playwrightVersion?: string
}

export type SessionStatus = 'READY' | 'RUNNING' | 'ERROR' | 'TIMED_OUT' | 'COMPLETED'

interface SessionBasicInfo {
    id: string
    status: SessionStatus
    createdAt?: number
    startedAt?: number
    endedAt?: number
    expiresAt?: number
    ttl?: number
    closureTimeout?: NodeJS.Timeout
}

export interface Session extends SessionBasicInfo {
    type: 'playwright'
    browser: 'chromium'
    server?: BrowserServer
}
