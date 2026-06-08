// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any[] is required; unknown[] breaks contravariant constructor parameter checking
export type ClassToken<T> = (new (...args: any[]) => T) | (abstract new (...args: any[]) => T);
export type SymbolToken<T> = symbol & { readonly __phantom?: T };
export type Token<T> = ClassToken<T> | SymbolToken<T>;

// Augment this interface to register string-keyed services with full type safety:
//   declare module 'ts-service-container' {
//     interface ServiceRegistry { Storage: StorageInterface; }
//   }
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServiceRegistry {}

type RegistryKey = keyof ServiceRegistry;
type AnyToken = Token<unknown> | string;

export function token<T>(description?: string): SymbolToken<T> {
    return Symbol(description);
}

function tokenName(t: AnyToken): string {
    if (typeof t === 'string') return t;
    if (typeof t === 'symbol') return t.description ?? String(t);
    return (t as { name: string }).name;
}

export class ServiceContainer {
    private readonly instances = new Map<AnyToken, unknown>();
    private readonly factories = new Map<AnyToken, (c: ServiceContainer) => unknown>();
    private readonly instantiationOrder: AnyToken[] = [];
    private readonly resolving = new Set<AnyToken>();

    set<K extends RegistryKey>(token: K, instance: ServiceRegistry[K]): void;
    set<T>(token: Token<T>, instance: T): void;
    set(token: AnyToken, instance: unknown): void {
        if (!this.instances.has(token)) {
            this.instantiationOrder.push(token);
        }
        this.instances.set(token, instance);
    }

    setFactory<K extends RegistryKey>(token: K, factory: (container: ServiceContainer) => ServiceRegistry[K]): void;
    setFactory<T>(token: Token<T>, factory: (container: ServiceContainer) => T): void;
    setFactory(token: AnyToken, factory: (container: ServiceContainer) => unknown): void {
        this.factories.set(token, factory);
    }

    get<K extends RegistryKey>(token: K): ServiceRegistry[K];
    get<T>(token: Token<T>): T;
    get(token: AnyToken): unknown {
        if (this.instances.has(token)) {
            return this.instances.get(token);
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
                return instance;
            } finally {
                this.resolving.delete(token);
            }
        }

        throw new Error(`Service not registered: ${tokenName(token)}`);
    }

    bind<K extends RegistryKey>(interfaceToken: K, implementation: Token<ServiceRegistry[K]>): void;
    bind<T>(interfaceToken: Token<T>, implementation: Token<T>): void;
    bind(interfaceToken: AnyToken, implementation: AnyToken): void {
        this.setFactory(interfaceToken as Token<unknown>, (c) => c.get(implementation as Token<unknown>));
    }

    has(token: AnyToken): boolean {
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

export function set<K extends RegistryKey>(token: K, instance: ServiceRegistry[K]): void;
export function set<T>(token: Token<T>, instance: T): void;
export function set(token: AnyToken, instance: unknown): void {
    defaultInstance.set(token as Token<unknown>, instance);
}

export function setFactory<K extends RegistryKey>(
    token: K,
    factory: (container: ServiceContainer) => ServiceRegistry[K],
): void;
export function setFactory<T>(token: Token<T>, factory: (container: ServiceContainer) => T): void;
export function setFactory(token: AnyToken, factory: (container: ServiceContainer) => unknown): void {
    defaultInstance.setFactory(token as Token<unknown>, factory);
}

export function get<K extends RegistryKey>(token: K): ServiceRegistry[K];
export function get<T>(token: Token<T>): T;
export function get(token: AnyToken): unknown {
    return defaultInstance.get(token as Token<unknown>);
}

export function has(token: AnyToken): boolean {
    return defaultInstance.has(token);
}

export async function dispose(): Promise<void> {
    return defaultInstance.dispose();
}

export function bind<K extends RegistryKey>(interfaceToken: K, implementation: Token<ServiceRegistry[K]>): void;
export function bind<T>(interfaceToken: Token<T>, implementation: Token<T>): void;
export function bind(interfaceToken: AnyToken, implementation: AnyToken): void {
    defaultInstance.bind(interfaceToken as Token<unknown>, implementation as Token<unknown>);
}

export const configure = set;
export const service = get;
export const factory = setFactory;
