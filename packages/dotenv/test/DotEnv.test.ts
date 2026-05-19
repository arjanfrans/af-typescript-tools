import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv } from '../src/DotEnv.js';

function makeTempDir(): string {
    return mkdtempSync(join(tmpdir(), 'dotenv-test-'));
}

function writeEnv(dir: string, filename: string, content: string): void {
    writeFileSync(join(dir, filename), content, 'utf-8');
}

describe('loadEnv', () => {
    let tmpDir: string;
    let originalEnv: Record<string, string | undefined>;

    beforeEach(() => {
        tmpDir = makeTempDir();
        originalEnv = { ...process.env };
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true });
        // Restore process.env
        for (const key of Object.keys(process.env)) {
            if (!(key in originalEnv)) {
                delete process.env[key];
            }
        }
        for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    });

    it('loads values from .env.<NODE_ENV>', () => {
        writeEnv(tmpDir, '.env.test', 'FOO=from_node_env');
        loadEnv({ cwd: tmpDir, nodeEnv: 'test' });
        assert.equal(process.env['FOO'], 'from_node_env');
    });

    it('loads values from .env.local', () => {
        writeEnv(tmpDir, '.env.local', 'BAR=from_local');
        loadEnv({ cwd: tmpDir, nodeEnv: 'test' });
        assert.equal(process.env['BAR'], 'from_local');
    });

    it('.env.local overrides .env.<NODE_ENV>', () => {
        writeEnv(tmpDir, '.env.test', 'OVERRIDE=node_env_value');
        writeEnv(tmpDir, '.env.local', 'OVERRIDE=local_value');
        loadEnv({ cwd: tmpDir, nodeEnv: 'test' });
        assert.equal(process.env['OVERRIDE'], 'local_value');
    });

    it('real process.env wins over .env.local', () => {
        process.env['REAL'] = 'real_value';
        writeEnv(tmpDir, '.env.local', 'REAL=local_value');
        loadEnv({ cwd: tmpDir, nodeEnv: 'test' });
        assert.equal(process.env['REAL'], 'real_value');
    });

    it('real process.env wins over .env.<NODE_ENV>', () => {
        process.env['REAL2'] = 'real_value';
        writeEnv(tmpDir, '.env.test', 'REAL2=node_env_value');
        loadEnv({ cwd: tmpDir, nodeEnv: 'test' });
        assert.equal(process.env['REAL2'], 'real_value');
    });

    it('handles missing env files gracefully', () => {
        assert.doesNotThrow(() => loadEnv({ cwd: tmpDir, nodeEnv: 'production' }));
    });

    it('strips surrounding quotes from values', () => {
        writeEnv(tmpDir, '.env.local', 'QUOTED="hello world"\nSINGLE=\'world hello\'');
        loadEnv({ cwd: tmpDir, nodeEnv: 'test' });
        assert.equal(process.env['QUOTED'], 'hello world');
        assert.equal(process.env['SINGLE'], 'world hello');
    });

    it('ignores comment lines and blank lines', () => {
        writeEnv(tmpDir, '.env.local', '# this is a comment\n\nKEY=value\n');
        loadEnv({ cwd: tmpDir, nodeEnv: 'test' });
        assert.equal(process.env['KEY'], 'value');
        assert.equal(process.env['# this is a comment'], undefined);
    });

    it('defaults nodeEnv to process.env.NODE_ENV', () => {
        process.env['NODE_ENV'] = 'staging';
        writeEnv(tmpDir, '.env.staging', 'STAGE_VAR=staging_value');
        loadEnv({ cwd: tmpDir });
        assert.equal(process.env['STAGE_VAR'], 'staging_value');
    });
});
