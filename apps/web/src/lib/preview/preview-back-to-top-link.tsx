'use client';

import Link from 'next/link';
import { buttonSecondary } from '@/lib/demo/cafe/theme';
import { useLang, makeTranslator } from '@/lib/demo/cafe/i18n';

interface Dict {
  backToPreviewTop: string;
}

const dictionary: Record<'ja' | 'en', Dict> = {
  ja: { backToPreviewTop: 'プレビュートップへ戻る' },
  en: { backToPreviewTop: 'Back to preview top' },
};

const t = makeTranslator(dictionary);

/** Manager screen's "back to preview top" link -- a tiny client component so it can read `useLang()` (the manager page itself is a server component). */
export function PreviewBackToTopLink({ href }: { href: string }) {
  const { lang } = useLang();
  return (
    <Link href={href} style={{ ...buttonSecondary, display: 'inline-block', fontSize: 14 }}>
      {t(lang, 'backToPreviewTop')}
    </Link>
  );
}
