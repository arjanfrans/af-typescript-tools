#!/usr/bin/env node
/**
 * Publish all packages at a consistent version.
 *
 * Usage:
 *   node scripts/publish.mjs <version> [--dry-run]
 *
 * Examples:
 *   node scripts/publish.mjs 1.2.3
 *   node scripts/publish.mjs 1.2.3 --dry-run
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const version = args.find(a => !a.startsWith('--'));

if (!version || !/^\d+\.\d+\.\d+(-[\w.]+(\.\d+)?)*$/.test(version)) {
    console.error('Usage: node scripts/publish.mjs <version> [--dry-run]');
    console.error('Example: node scripts/publish.mjs 1.2.3');
    process.exit(1);
}

const root = fileURLToPath(new URL('..', import.meta.url));
const packagesDir = join(root, 'packages');

const basePackagePath = join(root, 'package.base.json');
const basePackage = existsSync(basePackagePath)
    ? JSON.parse(readFileSync(basePackagePath, 'utf8'))
    : {};

function mergeWithBase(pkg) {
    const merged = { ...basePackage, ...pkg };
    for (const key of Object.keys(basePackage)) {
        if (basePackage[key] !== null && typeof basePackage[key] === 'object' && !Array.isArray(basePackage[key])) {
            merged[key] = { ...basePackage[key], ...(pkg[key] ?? {}) };
        }
    }
    return merged;
}

const packages = readdirSync(packagesDir)
    .filter(name => statSync(join(packagesDir, name)).isDirectory())
    .map(name => {
        const dir = join(packagesDir, name);
        const pkgPath = join(dir, 'package.json');
        try {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
            return { name, dir, pkgPath, pkg };
        } catch {
            return null;
        }
    })
    .filter(Boolean);

if (packages.length === 0) {
    console.error('No packages found in packages/');
    process.exit(1);
}

if (dryRun) console.log('[dry-run] No packages will actually be published.\n');

console.log(`Packages at v${version}:`);
for (const { pkg } of packages) {
    console.log(`  ${pkg.name}  (${pkg.version} → ${version})`);
}
console.log();

const packageNames = new Set(packages.map(({ pkg }) => pkg.name));

for (const { pkgPath, pkg } of packages) {
    pkg.version = version;
    for (const depField of ['dependencies', 'devDependencies', 'peerDependencies']) {
        if (!pkg[depField]) continue;
        for (const dep of Object.keys(pkg[depField])) {
            if (packageNames.has(dep)) pkg[depField][dep] = version;
        }
    }
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

const run = (cmd, cwd = root) =>
    execSync(cmd, { cwd, stdio: 'inherit' });

console.log('Building...');
run('npm run build --workspaces --if-present');

console.log('\nTesting...');
run('npm run test --workspaces --if-present');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const confirmed = await new Promise(resolve =>
    rl.question(`\nPublish ${packages.length} package(s) at v${version}? [y/N] `, answer => {
        rl.close();
        resolve(answer.toLowerCase() === 'y');
    })
);

if (!confirmed) {
    console.log('Aborted.');
    process.exit(0);
}

for (const { pkg, dir, pkgPath } of packages) {
    if (dryRun) {
        console.log(`[dry-run] would publish ${pkg.name}@${version}`);
    } else {
        console.log(`Publishing ${pkg.name}@${version}...`);
        const lean = readFileSync(pkgPath, 'utf8');
        writeFileSync(pkgPath, JSON.stringify(mergeWithBase(pkg), null, 2) + '\n');
        try {
            run('npm publish --access public', dir);
        } finally {
            writeFileSync(pkgPath, lean);
        }
    }
}

console.log(`\n${dryRun ? '[dry-run] Done.' : `All packages published at v${version}.`}`);
