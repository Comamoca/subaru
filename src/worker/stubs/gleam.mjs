export class Empty {
  constructor() {}
}

export class List {
  constructor(head, tail) {
    this.head = head;
    this.tail = tail;
  }

  static fromArray(arr) {
    if (arr.length === 0) return new Empty();
    return new List(arr[0], List.fromArray(arr.slice(1)));
  }

  toArray() {
    const result = [];
    function walk(lst) {
      if (lst instanceof List) {
        result.push(lst.head);
        walk(lst.tail);
      }
    }
    walk(this);
    return result;
  }
}

export const CustomType = class CustomType {};
export const BitArray = class BitArray {};
export const UtfCodepoint = class UtfCodepoint {};
export function bitArraySlice() {
  return new BitArray();
}
export function bitArraySliceToInt() {
  return 0;
}
