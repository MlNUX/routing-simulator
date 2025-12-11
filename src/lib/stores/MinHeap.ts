export class MinHeap<T> {
  private items: T[] = [];
  private readonly comparator: (a: T, b: T) => number;

  constructor(comparator: (a: T, b: T) => number) {
    this.comparator = comparator;
  }

  public insert(item: T): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  public extractMin(): T | undefined {
    if (this.items.length === 0) {
      return undefined;
    }
    if (this.items.length === 1) {
      return this.items.pop();
    }
    const min = this.items[0];
    this.items[0] = this.items.pop() as T;
    this.bubbleDown(0);
    return min;
  }

  public peek(): T | undefined {
    return this.items[0];
  }

  public isEmpty(): boolean {
    return this.items.length === 0;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.comparator(this.items[index], this.items[parentIndex]) >= 0) {
        break;
      }
      this.swap(index, parentIndex);
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.items.length;
    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let smallest = index;

      if (left < length && this.comparator(this.items[left], this.items[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.comparator(this.items[right], this.items[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === index) {
        break;
      }
      this.swap(index, smallest);
      index = smallest;
    }
  }

  private swap(i: number, j: number): void {
    const tmp = this.items[i];
    this.items[i] = this.items[j];
    this.items[j] = tmp;
  }
}
