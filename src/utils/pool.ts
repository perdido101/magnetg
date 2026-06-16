// Object pool — zero per-frame allocation in the hot loop.
// Active objects carry an `alive` flag; iterate the dense array and skip dead.

export interface Poolable {
  alive: boolean;
}

export class Pool<T extends Poolable> {
  readonly items: T[] = [];

  constructor(factory: () => T, capacity: number) {
    for (let i = 0; i < capacity; i++) {
      const it = factory();
      it.alive = false;
      this.items.push(it);
    }
  }

  /** Grab a dead slot (or null if at capacity — hard cap respected). */
  spawn(): T | null {
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      if (!items[i].alive) {
        items[i].alive = true;
        return items[i];
      }
    }
    return null;
  }

  get activeCount(): number {
    let n = 0;
    for (let i = 0; i < this.items.length; i++) if (this.items[i].alive) n++;
    return n;
  }

  forEachAlive(fn: (item: T) => void): void {
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].alive) fn(items[i]);
    }
  }

  clear(): void {
    for (let i = 0; i < this.items.length; i++) this.items[i].alive = false;
  }
}
