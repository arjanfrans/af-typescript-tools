import {get, set} from '../src/ServiceContainer.js'

class LocalStorage {

}

set(LocalStorage, new LocalStorage());

const x=  get(LocalStorage)

console.log(x)
