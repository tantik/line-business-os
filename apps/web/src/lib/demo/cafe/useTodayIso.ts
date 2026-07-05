'use client';

import { useEffect, useState } from 'react';
import { toISODate } from './format';

/**
 * Returns today's ISO date, resolved client-side only. The demo tables key
 * off "today" (highlighting, past/future split); computing that on the
 * server and again during client hydration can disagree by timezone or by a
 * few milliseconds around midnight, so we resolve it after mount instead of
 * baking it into the server-rendered HTML.
 */
export function useTodayIso(): string | null {
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    setToday(toISODate(new Date()));
  }, []);

  return today;
}
