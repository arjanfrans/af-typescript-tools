#!/usr/bin/env node
import { ESLint } from 'eslint';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
        fix: { type: 'boolean', default: false },
        env: { type: 'string', default: 'node' },
    },
    allowPositionals: true,
});

const env = values.env ?? 'node';
if (env !== 'node' && env !== 'browser') {
    console.error('Error: --env must be "node" or "browser"');
    process.exit(1);
}

const { default: config } = await import(new URL(`../src/eslint/${env}.js`, import.meta.url).href);

const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: config,
    fix: values.fix,
});

const patterns = positionals.length > 0 ? positionals : ['src'];
const results = await eslint.lintFiles(patterns);

if (values.fix) {
    await ESLint.outputFixes(results);
}

const formatter = await eslint.loadFormatter('stylish');
const output = await formatter.format(results);
if (output) process.stdout.write(output + '\n');

const errorCount = results.reduce((sum, r) => sum + r.errorCount, 0);
process.exit(errorCount > 0 ? 1 : 0);
