import { useEffect, useState } from 'react';
import { translationService } from './translation';

/**
 * Returns download progress (0–100) while the Chrome translation model is
 * being downloaded, or null when idle / complete.
 */
export function useTranslationProgress(): number | null {
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    return translationService.onDownloadProgress((fraction) => {
      setProgress(fraction >= 1 ? null : Math.round(fraction * 100));
    });
  }, []);

  return progress;
}
