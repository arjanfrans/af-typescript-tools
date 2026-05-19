import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { ServiceContainer, token, set, get, has, setFactory, dispose, type Token } from '../src/ServiceContainer.js';

// ── fixtures ────────────────────────────────────────────────────────────────

class Database {
    closed = false;
    async dispose() {
        this.closed = true;
    }
}

class Logger {
    disposed = false;
    async dispose() {
        this.disposed = true;
    }
}

class Repository {
    constructor(public readonly db: Database) {}
}

class Broken {
    static calls = 0;
}

// ── ServiceContainer class ───────────────────────────────────────────────────

describe('ServiceContainer', () => {
    let c: ServiceContainer;

    beforeEach(() => {
        c = new ServiceContainer();
    });

    describe('set / get', () => {
        it('returns the registered instance', () => {
            const db = new Database();
            c.set(Database, db);
            assert.strictEqual(c.get(Database), db);
        });

        it('overwrites a previous registration', () => {
            const a = new Database();
            const b = new Database();
            c.set(Database, a);
            c.set(Database, b);
            assert.strictEqual(c.get(Database), b);
        });

        it('throws for an unregistered token', () => {
            assert.throws(() => c.get(Database), /Service not registered/);
        });
    });

    describe('setFactory', () => {
        it('resolves lazily on first get', () => {
            let calls = 0;
            c.setFactory(Database, () => {
                calls++;
                return new Database();
            });
            assert.strictEqual(calls, 0);
            c.get(Database);
            assert.strictEqual(calls, 1);
        });

        it('caches the result — factory called only once', () => {
            let calls = 0;
            c.setFactory(Database, () => {
                calls++;
                return new Database();
            });
            c.get(Database);
            c.get(Database);
            assert.strictEqual(calls, 1);
        });

        it('passes the container so factories can resolve dependencies', () => {
            c.set(Database, new Database());
            c.setFactory(Repository, (container) => new Repository(container.get(Database)));
            const repo = c.get(Repository);
            assert.ok(repo instanceof Repository);
            assert.ok(repo.db instanceof Database);
        });

        it('throws on circular dependency', () => {
            // A depends on B, B depends on A
            class A {}
            class B {}
            c.setFactory(A, (cont) => {
                cont.get(B);
                return new A();
            });
            c.setFactory(B, (cont) => {
                cont.get(A);
                return new B();
            });
            assert.throws(() => c.get(A), /Circular dependency/);
        });
    });

    describe('has', () => {
        it('returns false for unregistered token', () => {
            assert.strictEqual(c.has(Database), false);
        });

        it('returns true after set', () => {
            c.set(Database, new Database());
            assert.strictEqual(c.has(Database), true);
        });

        it('returns true after setFactory even before first get', () => {
            c.setFactory(Database, () => new Database());
            assert.strictEqual(c.has(Database), true);
        });
    });

    describe('symbol tokens', () => {
        it('stores and retrieves a primitive value', () => {
            const DB_URL = token<string>('DB_URL');
            c.set(DB_URL, 'postgres://localhost/test');
            assert.strictEqual(c.get(DB_URL), 'postgres://localhost/test');
        });

        it('two tokens with the same description are independent', () => {
            const a = token<string>('x');
            const b = token<string>('x');
            c.set(a, 'value-a');
            c.set(b, 'value-b');
            assert.strictEqual(c.get(a), 'value-a');
            assert.strictEqual(c.get(b), 'value-b');
        });

        it('type inference: number token returns number', () => {
            const PORT = token<number>('PORT');
            c.set(PORT, 3000);
            const port: number = c.get(PORT); // must compile
            assert.strictEqual(port, 3000);
        });
    });

    describe('dispose', () => {
        it('calls dispose() on instances in reverse registration order', async () => {
            const order: string[] = [];
            const db = {
                dispose: async () => {
                    order.push('db');
                },
            };
            const log = {
                dispose: async () => {
                    order.push('log');
                },
            };
            c.set(Database, db as any);
            c.set(Logger, log as any);
            await c.dispose();
            assert.deepEqual(order, ['log', 'db']);
        });

        it('falls back to destroy()', async () => {
            let called = false;
            const svc = {
                destroy: async () => {
                    called = true;
                },
            };
            c.set(Database, svc as any);
            await c.dispose();
            assert.ok(called);
        });

        it('falls back to close()', async () => {
            let called = false;
            const svc = {
                close: async () => {
                    called = true;
                },
            };
            c.set(Database, svc as any);
            await c.dispose();
            assert.ok(called);
        });

        it('skips instances without lifecycle methods', async () => {
            c.set(Database, new Database());
            // no-op close — just should not throw
            await assert.doesNotReject(() => c.dispose());
        });

        it('disposes lazily-resolved factory instances', async () => {
            let closed = false;
            c.setFactory(Database, () =>
                Object.assign(new Database(), {
                    dispose: async () => {
                        closed = true;
                    },
                }),
            );
            c.get(Database); // trigger resolution
            await c.dispose();
            assert.ok(closed);
        });

        it('does not dispose factories that were never resolved', async () => {
            let called = false;
            c.setFactory(Database, () => {
                called = true;
                return new Database();
            });
            await c.dispose();
            assert.strictEqual(called, false);
        });

        it('clears the container after disposal', async () => {
            c.set(Database, new Database());
            await c.dispose();
            assert.strictEqual(c.has(Database), false);
        });
    });

    describe('clear', () => {
        it('removes all instances and factories', () => {
            c.set(Database, new Database());
            c.setFactory(Logger, () => new Logger());
            c.clear();
            assert.strictEqual(c.has(Database), false);
            assert.strictEqual(c.has(Logger), false);
        });
    });
});

// ── interface tokens ────────────────────────────────────────────────────────

describe('interface tokens', () => {
    // interface and token share the same name — type namespace vs value namespace
    interface Mailer {
        send(to: string): string;
    }
    const Mailer = token<Mailer>('Mailer');

    interface Cache {
        read(key: string): string | null;
    }
    const Cache = token<Cache>('Cache');

    let c: ServiceContainer;
    beforeEach(() => {
        c = new ServiceContainer();
    });

    it('accepts any implementation of the interface', () => {
        class SmtpMailer implements Mailer {
            send(to: string) {
                return `smtp:${to}`;
            }
        }
        c.set(Mailer, new SmtpMailer());
        assert.strictEqual(c.get(Mailer).send('a@b.com'), 'smtp:a@b.com');
    });

    it('swapping implementations returns the new one', () => {
        class SmtpMailer implements Mailer {
            send(to: string) {
                return `smtp:${to}`;
            }
        }
        class SesMailer implements Mailer {
            send(to: string) {
                return `ses:${to}`;
            }
        }
        c.set(Mailer, new SmtpMailer());
        c.set(Mailer, new SesMailer());
        assert.strictEqual(c.get(Mailer).send('a@b.com'), 'ses:a@b.com');
    });

    it('factory can wire an interface dependency', () => {
        class InMemoryCache implements Cache {
            read(_key: string) {
                return 'cached';
            }
        }
        class MailerWithCache implements Mailer {
            constructor(private cache: Cache) {}
            send(to: string) {
                return this.cache.read(to) ?? `sent:${to}`;
            }
        }
        c.set(Cache, new InMemoryCache());
        c.setFactory(Mailer, (cont) => new MailerWithCache(cont.get(Cache)));
        assert.strictEqual(c.get(Mailer).send('any'), 'cached');
    });
});

// ── default instance (module-level API) ─────────────────────────────────────

describe('default instance', () => {
    // reset between tests by re-testing with fresh class tokens
    // (each test uses unique classes so they don't bleed into each other)

    it('set / get roundtrip', () => {
        class Unique1 {}
        const instance = new Unique1();
        set(Unique1, instance);
        assert.strictEqual(get(Unique1), instance);
    });

    it('has returns true after set', () => {
        class Unique2 {}
        set(Unique2, new Unique2());
        assert.ok(has(Unique2));
    });

    it('setFactory resolves lazily', () => {
        class Unique3 {}
        let calls = 0;
        setFactory(Unique3, () => {
            calls++;
            return new Unique3();
        });
        assert.strictEqual(calls, 0);
        get(Unique3);
        assert.strictEqual(calls, 1);
    });
});
