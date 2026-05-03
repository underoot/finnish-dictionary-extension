import { sendMessage } from './messages';

type ChromeTranslator = {
  translate(text: string): Promise<string>;
};

type ChromeTranslatorAPI = {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<'available' | 'downloadable' | 'unavailable'>;
  create(opts: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: EventTarget) => void;
  }): Promise<ChromeTranslator>;
};

type ProgressListener = (fraction: number) => void;

function getChromeTranslator(): ChromeTranslatorAPI | null {
  const g = globalThis as any;
  if ('Translator' in g && typeof g.Translator?.create === 'function') return g.Translator;
  return null;
}

function isFirefox(): boolean {
  return typeof (globalThis as any).browser !== 'undefined' && !getChromeTranslator();
}

async function firefoxTranslate(text: string, from: string, to: string): Promise<string | null> {
  const result = await sendMessage({ type: 'TRANSLATE', text, from, to });
  if (!result.ok) {
    console.error('[Bergamot] background error:', result.error);
    return null;
  }
  return (result.data as string) ?? null;
}

class TranslationService {
  private textCache = new Map<string, string>();
  private translatorCache = new Map<string, Promise<ChromeTranslator>>();
  private progressListeners = new Set<ProgressListener>();
  private _targetLang: string;

  constructor() {
    const lang = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase();
    this._targetLang = lang.split('-')[0];
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get('pref:targetLang').then((result) => {
        const stored = result['pref:targetLang'];
        if (stored && typeof stored === 'string') {
          this._targetLang = stored;
          this.textCache.clear();
          this.translatorCache.clear();
        }
      });
    }
  }

  get targetLang(): string {
    return this._targetLang;
  }

  setTargetLang(lang: string): void {
    this._targetLang = lang;
    this.textCache.clear();
    this.translatorCache.clear();
  }

  get available(): boolean {
    return getChromeTranslator() !== null || isFirefox();
  }

  get shouldTranslateDefinitions(): boolean {
    return this._targetLang !== 'en' && this._targetLang !== 'fi';
  }

  get shouldTranslate(): boolean {
    return this._targetLang !== 'fi';
  }

  onDownloadProgress(cb: ProgressListener): () => void {
    this.progressListeners.add(cb);
    return () => this.progressListeners.delete(cb);
  }

  async translate(text: string, from = 'fi'): Promise<string | null> {
    const to = this._targetLang;
    if (!this.shouldTranslate || from === to || !text.trim()) return null;

    const key = `${from}\x00${to}\x00${text}`;
    if (this.textCache.has(key)) return this.textCache.get(key)!;

    try {
      let result: string | null = null;
      const chromeApi = getChromeTranslator();
      if (chromeApi) {
        result = await this.chromeTranslate(chromeApi, text, from, to);
      } else if (isFirefox()) {
        result = await firefoxTranslate(text, from, to);
      } else {
        console.warn('[Translation] No translation API available (not Chrome Translator, not Firefox)');
      }
      if (result !== null) this.textCache.set(key, result);
      return result;
    } catch (e) {
      console.error('[Translation] Unexpected error:', e);
      return null;
    }
  }

  private async chromeTranslate(
    api: ChromeTranslatorAPI,
    text: string,
    from: string,
    to: string,
  ): Promise<string> {
    const pairKey = `${from}:${to}`;
    if (!this.translatorCache.has(pairKey)) {
      const availability = await api.availability({ sourceLanguage: from, targetLanguage: to });
      if (availability === 'unavailable') throw new Error('unavailable');
      this.translatorCache.set(
        pairKey,
        api.create({
          sourceLanguage: from,
          targetLanguage: to,
          monitor: (m) => {
            m.addEventListener('downloadprogress', (e: any) => {
              const fraction: number = e.loaded ?? 0;
              for (const cb of this.progressListeners) cb(fraction);
            });
          },
        }),
      );
    }
    const translator = await this.translatorCache.get(pairKey)!;
    return translator.translate(text);
  }
}

export const translationService = new TranslationService();
