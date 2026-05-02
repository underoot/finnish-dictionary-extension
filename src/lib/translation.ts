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

type FirefoxTranslationsAPI = {
  translateText(text: string, opts: { fromLanguage: string; toLanguage: string }): Promise<string>;
};

type ProgressListener = (fraction: number) => void;

function getChromeTranslator(): ChromeTranslatorAPI | null {
  const g = globalThis as any;
  if ('Translator' in g && typeof g.Translator?.create === 'function') return g.Translator;
  return null;
}

function getFirefoxTranslations(): FirefoxTranslationsAPI | null {
  const g = globalThis as any;
  if (typeof g.browser?.translations?.translateText === 'function') return g.browser.translations;
  return null;
}

class TranslationService {
  private textCache = new Map<string, string>();
  private translatorCache = new Map<string, Promise<ChromeTranslator>>();
  private progressListeners = new Set<ProgressListener>();
  readonly browserLang: string;

  constructor() {
    const lang = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase();
    this.browserLang = lang.split('-')[0];
  }

  get available(): boolean {
    return getChromeTranslator() !== null || getFirefoxTranslations() !== null;
  }

  /** Translate definitions only when browser language is not English. */
  get shouldTranslateDefinitions(): boolean {
    return this.browserLang !== 'en' && this.browserLang !== 'fi';
  }

  /** Skip translation when browser is already Finnish. */
  get shouldTranslate(): boolean {
    return this.browserLang !== 'fi';
  }

  onDownloadProgress(cb: ProgressListener): () => void {
    this.progressListeners.add(cb);
    return () => this.progressListeners.delete(cb);
  }

  async translate(text: string, from = 'fi'): Promise<string | null> {
    const to = this.browserLang;
    if (!this.shouldTranslate || from === to || !text.trim()) return null;

    const key = `${from}\x00${to}\x00${text}`;
    if (this.textCache.has(key)) return this.textCache.get(key)!;

    try {
      let result: string | null = null;
      const chromeApi = getChromeTranslator();
      if (chromeApi) {
        result = await this.chromeTranslate(chromeApi, text, from, to);
      } else {
        const ffApi = getFirefoxTranslations();
        if (ffApi) result = await ffApi.translateText(text, { fromLanguage: from, toLanguage: to });
      }
      if (result !== null) this.textCache.set(key, result);
      return result;
    } catch {
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
