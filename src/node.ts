import fs from 'fs';

export const NODE_DEPENDENCIES: Record<string, string> = {};
if (process.env.npm_package_json) {
    const parsedPackageJson = JSON.parse(fs.readFileSync(process.env.npm_package_json).toString());
    if (typeof parsedPackageJson === 'object' && parsedPackageJson !== null) {
        if (
            'dependencies' in parsedPackageJson
            && typeof parsedPackageJson.dependencies === 'object'
            && parsedPackageJson.dependencies !== null
        ) {
            for (const [pkg, version] of Object.entries(parsedPackageJson.dependencies)) {
                if (typeof pkg !== 'string' || typeof version !== 'string') { continue; }
                NODE_DEPENDENCIES[pkg] = version;
            }
        }
    }
}
