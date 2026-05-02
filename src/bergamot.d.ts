declare module '@browsermt/bergamot-translator/translator.js' {
  export class TranslatorBacking {
    constructor(options: object);
    options: object;
    onerror: (e: Error) => void;
    loadWorker(): Promise<{ worker: Worker; exports: object }>;
    getModels(req: { from: string; to: string }): Promise<unknown[]>;
    getTranslationModel(model: { from: string; to: string }, opts?: unknown): Promise<unknown>;
    fetch(url: string, checksum: string, extra?: unknown): Promise<ArrayBuffer>;
    hexToBase64(hex: string): string;
  }

  export class BatchTranslator {
    constructor(options: object, backing: TranslatorBacking);
    translate(req: { from: string; to: string; text: string; html: boolean }): Promise<{ target: { text: string } }>;
    delete(): Promise<void>;
  }
}
