import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function parseEnvFile(content: string): Record<string, string> {
    const result: Record<string, string> = {};

    for (const line of content.split('\n')) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;

        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();

        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        if (key) {
            result[key] = value;
        }
    }

    return result;
}

function readEnvFile(path: string): Record<string, string> {
    return existsSync(path) ? parseEnvFile(readFileSync(path, 'utf-8')) : {};
}

export interface LoadEnvOptions {
    cwd?: string;
    nodeEnv?: string;
}

export function loadEnv(options: LoadEnvOptions = {}): void {
    const cwd = options.cwd ?? process.cwd();
    const nodeEnv = options.nodeEnv ?? process.env['NODE_ENV'] ?? 'development';

    const nodeEnvVars = readEnvFile(resolve(cwd, `.env.${nodeEnv}`));
    const localVars = readEnvFile(resolve(cwd, '.env.local'));

    // .env.local overrides .env.<NODE_ENV>; real process.env wins over both
    const merged = { ...nodeEnvVars, ...localVars };

    for (const [key, value] of Object.entries(merged)) {
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}
