import { TranslatorBacking, BatchTranslator } from '@browsermt/bergamot-translator/translator.js';

type ProgressListener = (fraction: number) => void;

interface WorkerExports {
  [key: string]: (...args: unknown[]) => Promise<unknown>;
}

interface LoadedWorker {
  worker: Worker;
  exports: WorkerExports;
}

function getExtensionUrl(path: string): string {
  return chrome.runtime.getURL(path);
}

// Remote Settings record shape for translations-models collection.
// The download URL is built from attachment.location, not a url field.
interface RSRecord {
  fromLang: string;
  toLang: string;
  fileType: string;
  attachment: { location: string; size?: number; hash?: string };
}

const FIREFOX_TRANSLATIONS_REGISTRY =
  'https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-models/records';

const ATTACHMENT_BASE = 'https://firefox-settings-attachments.cdn.mozilla.net';

class ExtensionBacking extends (TranslatorBacking as any) {
  readonly progressListeners = new Set<ProgressListener>();

  constructor(options: object) {
    super(options);
  }

  // Override to use Mozilla's Remote Settings registry instead of Bergamot S3,
  // which doesn't include Finnish models.
  async loadModelRegistery() {
    console.log('[Bergamot] fetching Firefox Translations registry');
    const response = await globalThis.fetch(FIREFOX_TRANSLATIONS_REGISTRY, { credentials: 'omit' });
    if (!response.ok) throw new Error(`Registry fetch failed: ${response.status}`);
    const { data }: { data: RSRecord[] } = await response.json();

    const byPair = new Map<string, { from: string; to: string; files: Record<string, unknown> }>();
    for (const rec of data) {
      if (!rec.fromLang || !rec.toLang || !rec.fileType || !rec.attachment?.location) continue;
      const key = `${rec.fromLang}${rec.toLang}`;
      if (!byPair.has(key)) byPair.set(key, { from: rec.fromLang, to: rec.toLang, files: {} });
      byPair.get(key)!.files[rec.fileType] = {
        name: `${ATTACHMENT_BASE}/${rec.attachment.location}`,
        size: rec.attachment.size,
        expectedSha256Hash: rec.attachment.hash,
      };
    }
    console.log('[Bergamot] registry has', byPair.size, 'language pairs');
    return Array.from(byPair.values());
  }

  async loadWorker(): Promise<LoadedWorker> {
    const workerUrl = getExtensionUrl('translator-worker.js');
    console.log('[Bergamot] spawning worker at', workerUrl);
    const worker = new Worker(workerUrl);

    let serial = 0;
    const pending = new Map<number, {
      accept: (v: unknown) => void;
      reject: (e: Error) => void;
      callsite: { message: string; stack?: string };
    }>();

    const call = (name: string, ...args: unknown[]) =>
      new Promise<unknown>((accept, reject) => {
        const id = ++serial;
        pending.set(id, {
          accept,
          reject,
          callsite: { message: `${name}(${args.map(String).join(', ')})`, stack: new Error().stack },
        });
        worker.postMessage({ id, name, args });
      });

    worker.addEventListener('message', ({ data: { id, result, error } }: MessageEvent) => {
      if (!pending.has(id)) return;
      const { accept, reject, callsite } = pending.get(id)!;
      pending.delete(id);
      if (error !== undefined) {
        reject(
          Object.assign(new Error(), error, {
            message: `${error.message} (response to ${callsite.message})`,
            stack: error.stack ? `${error.stack}\n${callsite.stack}` : callsite.stack,
          }),
        );
      } else {
        accept(result);
      }
    });

    worker.addEventListener('error', (this as any).onerror.bind(this));
    // Strip function-valued properties (e.g. onerror) — postMessage uses structured clone
    // which cannot transfer functions. The worker only needs primitive config values.
    const workerOptions = Object.fromEntries(
      Object.entries((this as any).options as Record<string, unknown>).filter(
        ([, v]) => typeof v !== 'function',
      ),
    );
    await call('initialize', workerOptions);

    return {
      worker,
      exports: new Proxy({} as WorkerExports, {
        get(_, name: string) {
          if (name !== 'then') return (...a: unknown[]) => call(name, ...a);
        },
      }),
    };
  }

  async fetch(url: string, checksum: string, extra?: { signal?: AbortSignal }): Promise<ArrayBuffer> {
    const opts: RequestInit = { credentials: 'omit' };
    if (checksum) opts.integrity = `sha256-${(this as any).hexToBase64(checksum)}`;
    if (extra?.signal) opts.signal = extra.signal;

    const response = await globalThis.fetch(url, opts);
    if (!response.body) return response.arrayBuffer();

    const total = +(response.headers.get('Content-Length') ?? 0);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total > 0) {
        for (const cb of this.progressListeners) cb(received / total);
      }
    }

    const out = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out.buffer;
  }
}

export class BergamotService {
  private backing: ExtensionBacking | null = null;
  private translator: InstanceType<typeof BatchTranslator> | null = null;
  private initPromise: Promise<void> | null = null;
  readonly progressListeners = new Set<ProgressListener>();

  private init(): void {
    console.log('[Bergamot] initializing backing + translator');
    this.backing = new ExtensionBacking({
      downloadTimeout: 120_000,
      onerror: (e: Error) => console.error('[Bergamot] worker error:', e),
    });
    this.translator = new BatchTranslator({}, this.backing as unknown as InstanceType<typeof TranslatorBacking>);
  }

  private ensureInit(): void {
    if (!this.backing) this.init();
  }

  async translate(text: string, from: string, to: string): Promise<string> {
    this.ensureInit();
    const response = await this.translator!.translate({ from, to, text, html: false });
    console.log(`[Bergamot] Translation result: "${response.target.text}"`);
    return response.target.text;
  }

  onDownloadProgress(cb: ProgressListener): () => void {
    this.ensureInit();
    this.backing!.progressListeners.add(cb);
    return () => this.backing!.progressListeners.delete(cb);
  }
}

export const bergamotService = new BergamotService();
