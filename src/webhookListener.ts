import * as http from 'http';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';

// ─── Competitive Companion Payload Types ──────────────────────────────────────

/**
 * A single test case as dispatched by Competitive Companion.
 * Both `input` and `output` are newline-terminated strings.
 */
export interface CCTestCase {
  readonly input: string;
  readonly output: string;
}

/** I/O channel descriptor (stdin/stdout/file). */
export interface CCIODescriptor {
  readonly type: string;
  readonly fileName?: string;
  readonly pattern?: string;
}

/** Batch metadata for multi-problem contest parsing. */
export interface CCBatch {
  readonly id: string;   // UUIDv4
  readonly size: number; // total problems in the batch
}

/**
 * Fully-typed Competitive Companion problem payload.
 * Every field is `readonly` — consumers receive immutable snapshots.
 */
export interface CCProblemPayload {
  readonly name: string;
  readonly group: string;
  readonly url: string;
  readonly interactive: boolean;
  readonly memoryLimit: number;   // MB
  readonly timeLimit: number;     // ms
  readonly tests: readonly CCTestCase[];
  readonly testType: 'single' | 'multiNumber';
  readonly input: CCIODescriptor;
  readonly output: CCIODescriptor;
  readonly languages?: Readonly<Record<string, unknown>>;
  readonly batch: CCBatch;
}

// ─── Listener Events ──────────────────────────────────────────────────────────

export interface WebhookListenerEvents {
  /** Emitted when a valid problem payload is received and parsed. */
  problem: (payload: CCProblemPayload) => void;
  /** Emitted when a batch of problems has been fully received. */
  batchComplete: (batchId: string, payloads: readonly CCProblemPayload[]) => void;
  /** Emitted on any operational error (malformed payload, network issue, etc.). */
  error: (error: WebhookListenerError) => void;
  /** Emitted when the server starts listening. */
  listening: (port: number) => void;
  /** Emitted when the server is fully shut down. */
  closed: () => void;
}

// ─── Error Classification ─────────────────────────────────────────────────────

export enum WebhookErrorCode {
  PAYLOAD_TOO_LARGE  = 'PAYLOAD_TOO_LARGE',
  MALFORMED_JSON     = 'MALFORMED_JSON',
  INVALID_PAYLOAD    = 'INVALID_PAYLOAD',
  METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED',
  SERVER_ERROR       = 'SERVER_ERROR',
  PORT_IN_USE        = 'PORT_IN_USE',
}

export class WebhookListenerError extends Error {
  constructor(
    public readonly code: WebhookErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'WebhookListenerError';
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Configuration ────────────────────────────────────────────────────────────

export interface WebhookListenerConfig {
  /** Port to listen on. Defaults to `10045` (Competitive Companion standard). */
  port: number;
  /** Hostname to bind to. Defaults to `127.0.0.1` (loopback only — never expose to network). */
  host: string;
  /** Maximum allowed request body size in bytes. Defaults to `1 MB`. */
  maxBodyBytes: number;
  /** Request read timeout in ms. Defaults to `5000`. */
  requestTimeoutMs: number;
  /** Batch assembly timeout in ms (how long to wait for remaining problems). Defaults to `30000`. */
  batchTimeoutMs: number;
}

const DEFAULT_CONFIG: Readonly<WebhookListenerConfig> = {
  port: 10045,
  host: '127.0.0.1',
  maxBodyBytes: 1 * 1024 * 1024,      // 1 MB
  requestTimeoutMs: 5_000,
  batchTimeoutMs: 30_000,
};

// ─── Batch Accumulator ────────────────────────────────────────────────────────

interface BatchAccumulator {
  payloads: CCProblemPayload[];
  expectedSize: number;
  timer: ReturnType<typeof setTimeout>;
}

// ─── Payload Validation ───────────────────────────────────────────────────────

/**
 * Runtime validation with surgical precision.
 * Rejects anything that doesn't match the CC contract —
 * we never pass garbage downstream.
 */
function validatePayload(raw: unknown): CCProblemPayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new WebhookListenerError(
      WebhookErrorCode.INVALID_PAYLOAD,
      'Payload must be a non-null JSON object.'
    );
  }

  const obj = raw as Record<string, unknown>;

  // ── Required string fields ──
  const requiredStrings: (keyof CCProblemPayload)[] = ['name', 'group', 'url'];
  for (const key of requiredStrings) {
    if (typeof obj[key] !== 'string' || (obj[key] as string).length === 0) {
      throw new WebhookListenerError(
        WebhookErrorCode.INVALID_PAYLOAD,
        `Missing or invalid required string field: "${key}".`
      );
    }
  }

  // ── Numeric limits ──
  if (typeof obj.memoryLimit !== 'number' || obj.memoryLimit <= 0) {
    throw new WebhookListenerError(
      WebhookErrorCode.INVALID_PAYLOAD,
      `"memoryLimit" must be a positive number (got: ${obj.memoryLimit}).`
    );
  }
  if (typeof obj.timeLimit !== 'number' || obj.timeLimit <= 0) {
    throw new WebhookListenerError(
      WebhookErrorCode.INVALID_PAYLOAD,
      `"timeLimit" must be a positive number (got: ${obj.timeLimit}).`
    );
  }

  // ── Tests array ──
  if (!Array.isArray(obj.tests)) {
    throw new WebhookListenerError(
      WebhookErrorCode.INVALID_PAYLOAD,
      `"tests" must be an array (got: ${typeof obj.tests}).`
    );
  }

  const tests: CCTestCase[] = (obj.tests as unknown[]).map((t, i) => {
    if (typeof t !== 'object' || t === null) {
      throw new WebhookListenerError(
        WebhookErrorCode.INVALID_PAYLOAD,
        `tests[${i}] must be an object.`
      );
    }
    const tc = t as Record<string, unknown>;
    if (typeof tc.input !== 'string') {
      throw new WebhookListenerError(
        WebhookErrorCode.INVALID_PAYLOAD,
        `tests[${i}].input must be a string.`
      );
    }
    if (typeof tc.output !== 'string') {
      throw new WebhookListenerError(
        WebhookErrorCode.INVALID_PAYLOAD,
        `tests[${i}].output must be a string.`
      );
    }
    return Object.freeze({ input: tc.input, output: tc.output });
  });

  // ── I/O descriptors ──
  const input  = validateIODescriptor(obj.input,  'input');
  const output = validateIODescriptor(obj.output, 'output');

  // ── Batch ──
  const batch = validateBatch(obj.batch);

  // ── testType ──
  const testType = obj.testType === 'multiNumber' ? 'multiNumber' as const : 'single' as const;

  // ── interactive (default false) ──
  const interactive = typeof obj.interactive === 'boolean' ? obj.interactive : false;

  // ── languages (optional, pass-through) ──
  const languages = (typeof obj.languages === 'object' && obj.languages !== null)
    ? Object.freeze(obj.languages as Record<string, unknown>)
    : undefined;

  return Object.freeze({
    name:        obj.name as string,
    group:       obj.group as string,
    url:         obj.url as string,
    interactive,
    memoryLimit: obj.memoryLimit as number,
    timeLimit:   obj.timeLimit as number,
    tests:       Object.freeze(tests),
    testType,
    input:       Object.freeze(input),
    output:      Object.freeze(output),
    ...(languages ? { languages } : {}),
    batch:       Object.freeze(batch),
  });
}

function validateIODescriptor(raw: unknown, fieldName: string): CCIODescriptor {
  if (typeof raw !== 'object' || raw === null) {
    // CC always sends these, but some custom senders may not — provide defaults.
    return { type: 'stdin' };
  }
  const obj = raw as Record<string, unknown>;
  return {
    type:     typeof obj.type === 'string' ? obj.type : 'stdin',
    fileName: typeof obj.fileName === 'string' ? obj.fileName : undefined,
    pattern:  typeof obj.pattern === 'string' ? obj.pattern : undefined,
  };
}

function validateBatch(raw: unknown): CCBatch {
  if (typeof raw !== 'object' || raw === null) {
    // Single-problem parse — synthesize a batch of 1.
    return { id: generateSimpleId(), size: 1 };
  }
  const obj = raw as Record<string, unknown>;
  return {
    id:   typeof obj.id === 'string' && obj.id.length > 0 ? obj.id : generateSimpleId(),
    size: typeof obj.size === 'number' && obj.size > 0 ? obj.size : 1,
  };
}

/** Fallback ID generator when crypto.randomUUID is unavailable. */
function generateSimpleId(): string {
  return crypto.randomUUID();
}

// ─── Webhook Listener ─────────────────────────────────────────────────────────

/**
 * A fully decoupled, event-driven HTTP webhook listener for Competitive Companion.
 *
 * Design principles:
 * - **Zero coupling**: communicates exclusively via typed events — no direct
 *   dependency on VS Code APIs, webview providers, or any UI layer.
 * - **Defensive networking**: body size limits, read timeouts, method guards.
 * - **Batch awareness**: accumulates multi-problem contest batches and emits
 *   a `batchComplete` event once all problems in a batch have arrived.
 * - **Graceful lifecycle**: `start()` → `stop()` → `start()` cycle is safe.
 *   Concurrent `start()` calls are idempotent. `stop()` drains connections.
 * - **Immutable payloads**: all emitted `CCProblemPayload` objects are frozen.
 */
export class CompetitiveCompanionListener extends EventEmitter {
  private _server: http.Server | null = null;
  private _config: WebhookListenerConfig;
  private _batches: Map<string, BatchAccumulator> = new Map();
  private _isStarting = false;

  constructor(config?: Partial<WebhookListenerConfig>) {
    super();
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /** Current configuration (read-only snapshot). */
  get config(): Readonly<WebhookListenerConfig> {
    return { ...this._config };
  }

  /** Whether the server is actively listening. */
  get isListening(): boolean {
    return this._server?.listening === true;
  }

  /** The port the server is bound to (or `undefined` if not listening). */
  get port(): number | undefined {
    if (!this._server?.listening) { return undefined; }
    const addr = this._server.address();
    return typeof addr === 'object' && addr !== null ? addr.port : undefined;
  }

  /**
   * Reconfigure the listener at runtime.
   * If the port changes while the server is running, the server is automatically
   * restarted on the new port.
   */
  async reconfigure(patch: Partial<WebhookListenerConfig>): Promise<void> {
    const oldPort = this._config.port;
    const oldBatchTimeout = this._config.batchTimeoutMs;
    this._config = { ...this._config, ...patch };

    if (this.isListening && (
      (patch.port !== undefined && patch.port !== oldPort) ||
      (patch.batchTimeoutMs !== undefined && patch.batchTimeoutMs !== oldBatchTimeout)
    )) {
      await this.stop();
      await this.start();
    }
  }

  /**
   * Start listening for incoming Competitive Companion webhooks.
   * Resolves once the server is bound and ready.
   * Rejects if the port is in use or another startup error occurs.
   */
  start(): Promise<void> {
    // Idempotent: if already listening on the configured port, no-op.
    if (this.isListening && this.port === this._config.port) {
      return Promise.resolve();
    }

    // Guard against concurrent start() races.
    if (this._isStarting) {
      return Promise.resolve();
    }

    this._isStarting = true;

    return new Promise<void>((resolve, reject) => {
      // If there's a stale server, tear it down first.
      if (this._server) {
        this._server.close();
        this._server = null;
      }

      const server = http.createServer((req, res) => this._handleRequest(req, res));

      // Harden the server:
      server.keepAliveTimeout = 5_000;
      server.headersTimeout   = 10_000;
      server.maxHeadersCount  = 50;

      server.on('error', (err: NodeJS.ErrnoException) => {
        this._isStarting = false;
        if (err.code === 'EADDRINUSE') {
          const wrappedErr = new WebhookListenerError(
            WebhookErrorCode.PORT_IN_USE,
            `Port ${this._config.port} is already in use. Another tool may be listening on it.`,
            err
          );
          this.emit('error', wrappedErr);
          reject(wrappedErr);
        } else {
          const wrappedErr = new WebhookListenerError(
            WebhookErrorCode.SERVER_ERROR,
            `Server error: ${err.message}`,
            err
          );
          this.emit('error', wrappedErr);
          reject(wrappedErr);
        }
      });

      server.listen(this._config.port, this._config.host, () => {
        this._server = server;
        this._isStarting = false;
        const boundPort = this.port ?? this._config.port;
        this.emit('listening', boundPort);
        resolve();
      });
    });
  }

  /**
   * Gracefully stop the listener.
   * Drains in-flight connections and clears all pending batch accumulators.
   */
  stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      // Clear all batch timers.
      for (const [, batch] of this._batches) {
        clearTimeout(batch.timer);
      }
      this._batches.clear();

      if (!this._server) {
        resolve();
        return;
      }

      this._server.close(() => {
        this._server = null;
        this.emit('closed');
        resolve();
      });

      // Force-close idle keep-alive sockets so close() doesn't hang.
      (this._server as any).closeAllConnections?.();
    });
  }

  /** Dispose all resources — alias for `stop()` for VS Code Disposable compatibility. */
  dispose(): Promise<void> {
    return this.stop();
  }

  // ── Typed EventEmitter overrides ──────────────────────────────────────────────

  on<K extends keyof WebhookListenerEvents>(event: K, listener: WebhookListenerEvents[K]): this {
    return super.on(event, listener);
  }

  once<K extends keyof WebhookListenerEvents>(event: K, listener: WebhookListenerEvents[K]): this {
    return super.once(event, listener);
  }

  off<K extends keyof WebhookListenerEvents>(event: K, listener: WebhookListenerEvents[K]): this {
    return super.off(event, listener);
  }

  emit<K extends keyof WebhookListenerEvents>(event: K, ...args: Parameters<WebhookListenerEvents[K]>): boolean {
    return super.emit(event, ...args);
  }

  // ── Request handling ──────────────────────────────────────────────────────────

  private _handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // ── Method guard ──
    if (req.method !== 'POST') {
      res.writeHead(405, {
        'Content-Type': 'application/json',
        Allow: 'POST',
      });
      res.end(JSON.stringify({ error: 'Method Not Allowed. Only POST is accepted.' }));
      this.emit('error', new WebhookListenerError(
        WebhookErrorCode.METHOD_NOT_ALLOWED,
        `Rejected ${req.method} request from ${req.socket.remoteAddress}.`
      ));
      return;
    }

    // ── Read body with size + timeout guards ──
    this._readBody(req)
      .then((body) => this._processBody(body, res))
      .catch((err) => {
        if (err instanceof WebhookListenerError) {
          const statusCode = err.code === WebhookErrorCode.PAYLOAD_TOO_LARGE ? 413 : 400;
          res.writeHead(statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
          this.emit('error', err);
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error.' }));
          this.emit('error', new WebhookListenerError(
            WebhookErrorCode.SERVER_ERROR,
            `Unexpected error: ${(err as Error).message}`,
            err
          ));
        }
      });
  }

  /**
   * Reads the full request body with:
   * - Streaming size enforcement (rejects immediately when limit is exceeded)
   * - Read timeout to prevent slow-loris attacks
   */
  private _readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let settled = false;

      const settle = (fn: () => void) => {
        if (settled) { return; }
        settled = true;
        clearTimeout(timer);
        fn();
      };

      const timer = setTimeout(() => {
        settle(() => {
          req.destroy();
          reject(new WebhookListenerError(
            WebhookErrorCode.SERVER_ERROR,
            `Request body read timed out after ${this._config.requestTimeoutMs}ms.`
          ));
        });
      }, this._config.requestTimeoutMs);

      req.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > this._config.maxBodyBytes) {
          settle(() => {
            req.destroy();
            reject(new WebhookListenerError(
              WebhookErrorCode.PAYLOAD_TOO_LARGE,
              `Request body exceeds ${this._config.maxBodyBytes} bytes limit.`
            ));
          });
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        settle(() => resolve(Buffer.concat(chunks).toString('utf-8')));
      });

      req.on('error', (err) => {
        settle(() => reject(new WebhookListenerError(
          WebhookErrorCode.SERVER_ERROR,
          `Request stream error: ${err.message}`,
          err
        )));
      });
    });
  }

  /**
   * Parse, validate, and route the request body.
   * Responds with 200 on success, 400/413 on client error.
   */
  private _processBody(body: string, res: http.ServerResponse): void {
    // ── JSON parse ──
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch (err) {
      const wrapped = new WebhookListenerError(
        WebhookErrorCode.MALFORMED_JSON,
        `Malformed JSON body: ${(err as Error).message}`,
        err
      );
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: wrapped.message }));
      this.emit('error', wrapped);
      return;
    }

    // ── Validate ──
    let payload: CCProblemPayload;
    try {
      payload = validatePayload(raw);
    } catch (err) {
      if (err instanceof WebhookListenerError) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        this.emit('error', err);
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Validation error.' }));
        this.emit('error', new WebhookListenerError(
          WebhookErrorCode.SERVER_ERROR,
          `Unexpected validation error: ${(err as Error).message}`,
          err
        ));
      }
      return;
    }

    // ── Success — respond immediately (don't block Competitive Companion) ──
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));

    // ── Emit per-problem event ──
    this.emit('problem', payload);

    // ── Batch accumulation ──
    this._accumulateBatch(payload);
  }

  /**
   * Accumulates problems belonging to the same batch (contest).
   * Emits `batchComplete` once all expected problems arrive,
   * or after a timeout if the batch is incomplete.
   */
  private _accumulateBatch(payload: CCProblemPayload): void {
    const batchId = payload.batch.id;
    const expectedSize = payload.batch.size;

    // Single-problem parse — no batching needed.
    if (expectedSize <= 1) {
      this.emit('batchComplete', batchId, Object.freeze([payload]));
      return;
    }

    let accumulator = this._batches.get(batchId);

    if (!accumulator) {
      const timer = setTimeout(() => {
        // Timeout: emit whatever we have and clean up.
        const acc = this._batches.get(batchId);
        if (acc) {
          this._batches.delete(batchId);
          this.emit('batchComplete', batchId, Object.freeze([...acc.payloads]));
        }
      }, this._config.batchTimeoutMs);

      accumulator = { payloads: [], expectedSize, timer };
      this._batches.set(batchId, accumulator);
    }

    accumulator.payloads.push(payload);

    if (accumulator.payloads.length >= accumulator.expectedSize) {
      clearTimeout(accumulator.timer);
      this._batches.delete(batchId);
      this.emit('batchComplete', batchId, Object.freeze([...accumulator.payloads]));
    }
  }
}
