'use client';

import { useState } from 'react';
import { demoColors } from '@/lib/demo/cafe/theme';

export function PreviewLanguageToggle() {
  const [language, setLanguage] = useState<'ja' | 'en'>('ja');
  return (
    <div aria-label="Language" style={{ display: 'inline-flex', border: `1px solid ${demoColors.border}`, borderRadius: 999, overflow: 'hidden' }}>
      {(['ja', 'en'] as const).map((value) => (
        <button key={value} type="button" aria-pressed={language === value} onClick={() => setLanguage(value)}
          style={{ border: 0, padding: '7px 12px', background: language === value ? demoColors.accent : 'transparent', color: language === value ? '#fff' : demoColors.textMuted, fontWeight: 700, cursor: 'pointer' }}>
          {value.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
