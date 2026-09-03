/* tslint:disable */
/* eslint-disable */

/**
 * A pending file offer from the sender. Consumed by exactly one of
 * `accept()` or `reject()`.
 */
export class ReceiveOffer {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Accept the offer and return the received bytes once the transfer completes.
     */
    accept(on_status: Function, on_progress: Function): Promise<Uint8Array>;
    /**
     * Reject the offer and let the sender know.
     */
    reject(): Promise<void>;
    readonly fileName: string;
    readonly fileSize: number;
}

export function start(): void;

/**
 * Abort whatever `wormhole_send` / `wormhole_receive_connect` / `ReceiveOffer::accept`
 * call is currently in flight. A no-op if nothing is running.
 */
export function wormhole_cancel(): void;

/**
 * Connect to an existing wormhole code and wait for the sender's file offer.
 * Returns a [`ReceiveOffer`] describing the pending offer; call `accept()`
 * or `reject()` on it to finish.
 */
export function wormhole_receive_connect(code: string, on_status: Function): Promise<ReceiveOffer>;

/**
 * Send `bytes` (named `file_name`) through a freshly allocated wormhole code.
 *
 * `on_code(code)` fires as soon as a code has been allocated (show it to the
 * user immediately - the other side needs it to connect). `on_status(text)`
 * fires on major state changes ("waiting for the other side", "connected",
 * "transferring"). `on_progress(sent, total)` fires repeatedly while bytes
 * are moving.
 */
export function wormhole_send(bytes: Uint8Array, file_name: string, on_code: Function, on_status: Function, on_progress: Function): Promise<void>;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_receiveoffer_free: (a: number, b: number) => void;
    readonly receiveoffer_accept: (a: number, b: any, c: any) => any;
    readonly receiveoffer_fileName: (a: number) => [number, number];
    readonly receiveoffer_fileSize: (a: number) => number;
    readonly receiveoffer_reject: (a: number) => any;
    readonly start: () => void;
    readonly wormhole_cancel: () => void;
    readonly wormhole_receive_connect: (a: number, b: number, c: any) => any;
    readonly wormhole_send: (a: any, b: number, c: number, d: any, e: any, f: any) => any;
    readonly wasm_bindgen__convert__closures_____invoke__h907a48b4c371d421: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h484d7a0df7c092fd: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h6952384a6a5b30c4: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h6952384a6a5b30c4_2: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h337d1dafed169b77: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
