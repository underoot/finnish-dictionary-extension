import { useEffect, useState } from 'react';
import { useLocale } from '../lib/useLocale';
import { UI_LOCALES, TARGET_LANGS } from '../lib/i18n';
import { translationService } from '../lib/translation';

export default function Settings() {
  const { msgs, isRtl } = useLocale();
  const [uiLocale, setUiLocale] = useState('');
  const [targetLang, setTargetLang] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(['pref:uiLocale', 'pref:targetLang']).then((result) => {
      if (result['pref:uiLocale']) setUiLocale(result['pref:uiLocale']);
      if (result['pref:targetLang']) {
        setTargetLang(result['pref:targetLang']);
      } else {
        setTargetLang(translationService.targetLang);
      }
    });
  }, []);

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleUiLocale = (val: string) => {
    setUiLocale(val);
    chrome.storage.local.set({ 'pref:uiLocale': val });
    flashSaved();
  };

  const handleTargetLang = (val: string) => {
    setTargetLang(val);
    chrome.storage.local.set({ 'pref:targetLang': val });
    translationService.setTargetLang(val);
    flashSaved();
  };

  return (
    <div className="wrap" dir={isRtl ? 'rtl' : 'ltr'}>
      <h1>{msgs.settingsTitle}</h1>
      <div className="setting-group">
        <label className="setting-label">{msgs.interfaceLanguage}</label>
        <select
          className="setting-select"
          value={uiLocale}
          onChange={(e) => handleUiLocale(e.target.value)}
        >
          {UI_LOCALES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>
      <div className="setting-group">
        <label className="setting-label">{msgs.translationLanguage}</label>
        <select
          className="setting-select"
          value={targetLang}
          onChange={(e) => handleTargetLang(e.target.value)}
        >
          {TARGET_LANGS.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>
      {saved && <div className="saved-flash">{msgs.saved}</div>}
    </div>
  );
}
