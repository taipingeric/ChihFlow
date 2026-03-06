export class AsyncLocalStorage {
  constructor() {
    this.store = undefined;
  }

  getStore() {
    return this.store;
  }

  run(store, callback) {
    const previous = this.store;
    this.store = store;
    try {
      return callback();
    } finally {
      this.store = previous;
    }
  }

  enterWith(store) {
    this.store = store;
  }
}
