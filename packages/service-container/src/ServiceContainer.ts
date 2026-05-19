export type ClassToken<T> = (new (...args: unknown[]) => T) | (abstract new (...args: unknown[]) => T);
export type SymbolToken<T> = symbol & { readonly __phantom?: T };
export type Token<T> = ClassToken<T> | SymbolToken<T>;

export function token<T>(description?: string): SymbolToken<T> {
    return Symbol(description);
}

function tokenName(t: Token<unknown>): string {
    if (typeof t === 'symbol') return t.description ?? String(t);
    return (t as { name: string }).name;
}

export class ServiceContainer {
    private readonly instances = new Map<Token<unknown>, unknown>();
    private readonly factories = new Map<Token<unknown>, (c: ServiceContainer) => unknown>();
    private readonly instantiationOrder: Token<unknown>[] = [];
    private readonly resolving = new Set<Token<unknown>>();

    set<T>(token: Token<T>, instance: T): void {
        if (!this.instances.has(token)) {
            this.instantiationOrder.push(token);
        }
        this.instances.set(token, instance);
    }

    setFactory<T>(token: Token<T>, factory: (container: ServiceContainer) => T): void {
        this.factories.set(token, factory);
    }

    get<T>(token: Token<T>): T {
        if (this.instances.has(token)) {
            return this.instances.get(token) as T;
        }

        const factory = this.factories.get(token);
        if (factory) {
            if (this.resolving.has(token)) {
                throw new Error(`Circular dependency detected for: ${tokenName(token)}`);
            }
            this.resolving.add(token);
            try {
                const instance = factory(this);
                this.instantiationOrder.push(token);
                this.instances.set(token, instance);
                return instance as T;
            } finally {
                this.resolving.delete(token);
            }
        }

        throw new Error(`Service not registered: ${tokenName(token)}`);
    }

    has<T>(token: Token<T>): boolean {
        return this.instances.has(token) || this.factories.has(token);
    }

    async dispose(): Promise<void> {
        for (const t of [...this.instantiationOrder].reverse()) {
            const instance = this.instances.get(t) as Record<string, unknown>;
            if (!instance) continue;
            if (typeof instance['dispose'] === 'function') await (instance['dispose'] as () => Promise<void>)();
            else if (typeof instance['destroy'] === 'function') await (instance['destroy'] as () => Promise<void>)();
            else if (typeof instance['close'] === 'function') await (instance['close'] as () => Promise<void>)();
        }
        this.clear();
    }

    clear(): void {
        this.instances.clear();
        this.factories.clear();
        this.instantiationOrder.length = 0;
        this.resolving.clear();
    }
}

const defaultInstance = new ServiceContainer();

export function set<T>(token: Token<T>, instance: T): void {
    defaultInstance.set(token, instance);
}

export function setFactory<T>(token: Token<T>, factory: (container: ServiceContainer) => T): void {
    defaultInstance.setFactory(token, factory);
}

export function get<T>(token: Token<T>): T {
    return defaultInstance.get(token);
}

export function has<T>(token: Token<T>): boolean {
    return defaultInstance.has(token);
}

export async function dispose(): Promise<void> {
    return defaultInstance.dispose();
}

export const configure = set;
export const service = get;
