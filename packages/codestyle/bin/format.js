#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import prettier from 'prettier';
import fg from 'fast-glob';
const { glob } = fg;
import prettierConfig from '../src/prettier.config.js';

const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
        check: { type: 'boolean', default: false },
    },
    allowPositionals: true,
});

const dirs = positionals.length > 0 ? positionals : ['src'];
const patterns = dirs.map((d) => `${d}/**/*.{ts,tsx,js,jsx,mjs,cjs,json,css,scss,html,md}`);

const files = await glob(patterns, {
    ignore: ['**/node_modules/**', '**/dist/**'],
    absolute: true,
    dot: false,
});

let hasUnformatted = false;

for (const file of files) {
    const source = await readFile(file, 'utf8');
    const options = { ...prettierConfig, filepath: file };

    if (values.check) {
        const ok = await prettier.check(source, options);
        if (!ok) {
            console.log(`not formatted: ${file}`);
            hasUnformatted = true;
        }
    } else {
        const formatted = await prettier.format(source, options);
        if (formatted !== source) {
            await writeFile(file, formatted, 'utf8');
            console.log(`formatted: ${file}`);
        }
    }
}

if (values.check && hasUnformatted) {
    process.exit(1);
}
