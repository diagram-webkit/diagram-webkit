// Web platform APIs that exist in both browsers and Node, declared for the
// DOM-free core build (tsconfig.core.json). Keep this to what core uses.
declare class URLSearchParams {
  constructor(init?: string | Record<string, string> | [string, string][]);
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
  set(name: string, value: string): void;
  append(name: string, value: string): void;
  delete(name: string): void;
  keys(): IterableIterator<string>;
  entries(): IterableIterator<[string, string]>;
  forEach(callback: (value: string, key: string) => void): void;
  toString(): string;
  readonly size: number;
  [Symbol.iterator](): IterableIterator<[string, string]>;
}
declare function btoa(data: string): string;
declare function atob(data: string): string;
declare const console: {
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
};
