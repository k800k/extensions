export type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };
export type ExtensionKind = "content";
export type AuthenticationMode = "none" | "basic" | "apiKey" | "oauth2PKCE" | "visibleWebSession";
export type Rating = "SAFE" | "MATURE" | "ADULT";

export interface CursorPage<T> { items: T[]; metadata?: JSONValue; }
export interface HTTPRequest { url: string; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD"; headers?: Record<string, string>; cookies?: Record<string, string>; body?: JSONValue | string | ArrayBuffer; }
export interface HTTPResponse { url: string; status: number; headers: Record<string, string>; mimeType?: string; cookies: unknown[]; dataBase64: string; }
export interface HTTPInterceptor { request?(request: HTTPRequest): HTTPRequest | Promise<HTTPRequest>; response?(request: HTTPRequest, response: HTTPResponse): void | Promise<void>; }
export interface KeyValueState { get(key: string): JSONValue | undefined; set(key: string, value: JSONValue): void; remove(key: string): void; }
export interface RuntimeContext {
  http: { request(request: HTTPRequest): Promise<HTTPResponse>; registerInterceptor(interceptor: HTTPInterceptor): void };
  cookies: { getAll(): JSONValue[]; setAll(cookies: JSONValue[]): void };
  state: KeyValueState & { reset(): void };
  secureState: KeyValueState;
  rateLimit: { sleep(milliseconds: number): Promise<void> };
  log: { debug(message: string): void; warning(message: string): void };
  clock: { now(): string };
  challenge: { request(url?: string): void };
  authentication: { request(descriptor: JSONValue): void };
  encoding: { toBase64(value: ArrayBuffer): string; fromBase64(value: string): ArrayBuffer };
}

export interface ContentExtension {
  id: string; apiVersion: "1.0"; initialize?(context: RuntimeContext): void | Promise<void>;
  settings?(): JSONValue; discoverSections?(): JSONValue[]; discover?(input: JSONValue): Promise<CursorPage<JSONValue>>;
  searchFilters?(): JSONValue; search(input: JSONValue): Promise<CursorPage<JSONValue>>; details(id: string): Promise<JSONValue>;
  installments(work: JSONValue): Promise<JSONValue[]>; imagePages(installment: JSONValue): Promise<JSONValue>;
  imagePageContent?(input: JSONValue): Promise<JSONValue>; updates?(input: JSONValue): Promise<JSONValue>;
  managedCollections?(input: JSONValue): Promise<JSONValue>; synchronizeManagedCollection?(collection: JSONValue): Promise<void>;
}

export declare function defineContentExtension<T extends ContentExtension>(value: T): Readonly<T & { kind: "content" }>;
export declare function unavailable(message?: string): never;
export declare const apiVersion: "1.0";
