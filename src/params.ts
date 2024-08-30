import { log } from 'apify';
import { DefaultProxy, isDefaultProxy } from './proxies.js';

/**
 * Aims to be compatible with:
 * - https://docs.browserless.io/chrome-flags/
 */
export interface LaunchOptions {
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

function parseBooleanString(value: string): boolean | undefined {
    if (value === 'true') { return true; }
    if (value === 'false') { return false; }
    return undefined;
}

function parseArrayString(value: string): string[] | undefined {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) { return undefined; }
    return parsed;
}

function parseObjectString(value: string): Record<string, unknown> | undefined {
    const parsed = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) { return undefined; }
    return parsed;
}

function parseIntegerString(value: string): number | undefined {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) { return undefined; }
    return parsed;
}

/**
 * @param path the final part of the URL, e.g., "/", "/?proxy=residential"
 * @returns parsed and validated launchOptions
 */
export function parseReqParams(path: string) {
    const launchOptions: LaunchOptions = {};

    let params: URLSearchParams;
    try {
        params = new URLSearchParams(path.split('?').at(-1));
    } catch (e) {
        log.exception(e as Error, 'Error parsing request URL');
        return launchOptions;
    }

    const proxy = params.get('proxy');
    if (proxy !== null) {
        if (isDefaultProxy(proxy)) {
            launchOptions.proxy = proxy;
        } else {
            log.warning('Invalid proxy param', { proxy });
        }
    }

    const proxyGroups = params.get('proxyGroups');
    if (proxyGroups !== null) {
        const parsedProxyGroups = parseArrayString(proxyGroups);
        if (parsedProxyGroups) {
            launchOptions.proxyGroups = parsedProxyGroups;
        } else {
            log.warning('Invalid proxyGroups param', { proxyGroups });
        }
    }

    const proxyCountry = params.get('proxyCountry');
    if (proxyCountry !== null) {
        launchOptions.proxyCountry = proxyCountry;
    }

    // const blockAds = params.get('blockAds');
    // if (blockAds !== null) {
    //     const parsedBlockAds = parseBooleanString(blockAds);
    //     if (parsedBlockAds) {
    //         launchOptions.blockAds = parsedBlockAds;
    //     } else {
    //         log.warning('Invalid blockAds param', { blockAds });
    //     }
    // }

    const launch = params.get('launch');
    if (launch !== null) {
        const parsedLaunch = parseObjectString(launch);
        if (parsedLaunch) {
            launchOptions.launch = {};
            // if ('stealth' in parsedLaunch) {
            //     if (typeof parsedLaunch.stealth === 'boolean') {
            //         launchOptions.launch.stealth = parsedLaunch.stealth;
            //     } else {
            //         log.warning('Invalid launch.stealth param', { stealth: parsedLaunch.stealth });
            //     }
            // }
            if ('headless' in parsedLaunch) {
                if (typeof parsedLaunch.headless === 'boolean') {
                    launchOptions.launch.headless = parsedLaunch.headless;
                } else {
                    log.warning('Invalid launch.stealth param', { headless: parsedLaunch.headless });
                }
            }
            if ('args' in parsedLaunch) {
                if (Array.isArray(parsedLaunch.args) && parsedLaunch.args.every((item) => typeof item === 'string')) {
                    launchOptions.launch.args = parsedLaunch.args;
                } else {
                    log.warning('Invalid launch.stealth param', { args: parsedLaunch.args });
                }
            }
        } else {
            log.warning('Invalid launch param', { launch });
        }
    }

    const ignoreDefaultArgs = params.get('ignoreDefaultArgs');
    if (ignoreDefaultArgs !== null) {
        const parsedIgnoreDefaultPath = parseBooleanString(ignoreDefaultArgs);
        if (parsedIgnoreDefaultPath) {
            launchOptions.ignoreDefaultArgs = parsedIgnoreDefaultPath;
        } else {
            log.warning('Invalid ignoreDefaultPath param', { ignoreDefaultPath: ignoreDefaultArgs });
        }
    }

    const timeout = params.get('timeout');
    if (timeout !== null) {
        const parsedTimeout = parseIntegerString(timeout);
        if (parsedTimeout) {
            launchOptions.timeout = parsedTimeout;
        } else {
            log.warning('Invalid timeout param', { timeout });
        }
    }

    const ttl = params.get('ttl');
    if (ttl !== null) {
        const parsedTtl = parseIntegerString(ttl);
        if (parsedTtl) {
            launchOptions.ttl = parsedTtl;
        } else {
            log.warning('Invalid ttl param', { ttl });
        }
    }

    return launchOptions;
}
