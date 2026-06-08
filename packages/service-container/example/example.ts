import { bind, get, set } from '../src/ServiceContainer.js'

interface StorageInterface {
    read(key: string): string;
}

// Augment the registry once — this is the only declaration needed
declare module '../src/ServiceContainer.js' {
    interface ServiceRegistry {
        Storage: StorageInterface;
    }
}

class LocalStorage implements StorageInterface {
    read(key: string) { return `local:${key}`; }
}

// Register & bind
set(LocalStorage, new LocalStorage());
bind('Storage', LocalStorage);

// 'Storage' is typed — only valid keys compile, return type is StorageInterface
const storage = get('Storage');
console.log(storage.read('foo')); // local:foo

// TypeScript error — 'Unknown' is not in ServiceRegistry:
// get('Unknown');
