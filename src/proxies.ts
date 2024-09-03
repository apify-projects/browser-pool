import { Actor, log } from 'apify';
import { DefaultProxy, LaunchOptions, PlaywrightProxyConfiguration, ProxyConfiguration, SessionType } from './types.js';
import { UnsupportedSessionError } from './errors.js';

export function isDefaultProxy(value: unknown): value is DefaultProxy {
    return value === 'datacenter' || value === 'residential';
}

const DEFAULT_PROXY_GROUPS: Record<DefaultProxy, string> = {
    datacenter: 'AUTO',
    residential: 'RESIDENTIAL',
};

export async function getProxyConfiguration(type: 'playwright', options: LaunchOptions): Promise<PlaywrightProxyConfiguration | undefined>;
export async function getProxyConfiguration(type: SessionType, options: LaunchOptions): Promise<ProxyConfiguration | undefined> {
    if (!options.enableProxy && !options.proxy && !options.proxyGroups && !options.proxyCountry) {
        return undefined;
    }
    const defaultProxyGroup = options.proxy ? DEFAULT_PROXY_GROUPS[options.proxy] : undefined;
    const proxyGroups = [
        ...defaultProxyGroup ? [defaultProxyGroup] : [],
        ...options.proxyGroups ? options.proxyGroups : [],
    ];

    const proxyOptions = {
        useApifyProxy: true,
        groups: proxyGroups.length > 0 ? proxyGroups : undefined,
        countryCode: options.proxyCountry?.toUpperCase(),
    };
    log.info('Creating proxy configuration', proxyOptions);
    const proxyConfiguration = await Actor.createProxyConfiguration(proxyOptions);

    const proxyInfo = await proxyConfiguration?.newProxyInfo();
    if (!proxyInfo) { return undefined; }

    switch (type) {
        case 'playwright':
            return { server: proxyInfo.url, username: proxyInfo.username, password: proxyInfo.password };
        default:
            throw new UnsupportedSessionError(type);
    }
}
