import { Actor, log } from 'apify';

export type DefaultProxy = 'datacenter' | 'residential'

export function isDefaultProxy(value: unknown): value is DefaultProxy {
    return value === 'datacenter' || value === 'residential';
}

const DEFAULT_PROXY_GROUPS: Record<DefaultProxy, string> = {
    datacenter: 'AUTO',
    residential: 'RESIDENTIAL',
};

export async function getProxyConfiguration(
    options: {
        defaultProxy?: DefaultProxy
        groups?: string[]
        countryCode?: string
    },
): Promise<{ server: string; bypass?: string; username?: string; password?: string; } | undefined> {
    if (!options.defaultProxy && !options.groups && !options.countryCode) {
        return undefined;
    }
    const defaultProxyGroup = options.defaultProxy ? DEFAULT_PROXY_GROUPS[options.defaultProxy] : undefined;
    const proxyGroups = [
        ...defaultProxyGroup ? [defaultProxyGroup] : [],
        ...options.groups ? options.groups : [],
    ];

    const proxyOptions = {
        useApifyProxy: true,
        groups: proxyGroups.length > 0 ? proxyGroups : undefined,
        countryCode: options.countryCode?.toUpperCase(),
    };
    log.info('Creating proxy configuration', proxyOptions);
    const proxyConfiguration = await Actor.createProxyConfiguration(proxyOptions);

    const proxyInfo = await proxyConfiguration?.newProxyInfo();
    if (!proxyInfo) { return undefined; }
    return { server: proxyInfo.url, username: proxyInfo.username, password: proxyInfo.password };
}
