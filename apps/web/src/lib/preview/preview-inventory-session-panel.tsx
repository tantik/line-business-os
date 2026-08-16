'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { InventoryCheckSession, InventoryCheckSessionItem, InventoryCheckType } from '@/lib/inventory/check-sessions';
import { useLang } from '@/lib/demo/cafe/i18n';
import { badgeStyle, buttonDisabled, buttonPrimary, buttonSecondary, card, input, mutedText } from '@/lib/demo/cafe/theme';
import {
  previewCompleteInventorySession,
  previewRecordInventorySessionItem,
  previewStartInventorySession,
} from './actions/inventory-session-actions';
import { previewWriteMessage } from './write-result';

export function PreviewInventorySessionPanel({
  businessDate,
  sessions,
  itemsBySession,
  readOnly = false,
}: {
  businessDate: string;
  sessions: InventoryCheckSession[];
  itemsBySession: Record<string, InventoryCheckSessionItem[]>;
  readOnly?: boolean;
}) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function run(action: (data: FormData) => Promise<{ status: Parameters<typeof previewWriteMessage>[1] | 'success' }>, data: FormData) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action(data);
      if (result.status === 'success') router.refresh();
      else setFeedback(previewWriteMessage(lang, result.status));
    });
  }

  function start(type: InventoryCheckType) {
    const data = new FormData();
    data.set('businessDate', businessDate);
    data.set('checkType', type);
    run(previewStartInventorySession, data);
  }

  return (
    <section style={{ ...card, marginTop: 18 }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>{lang === 'ja' ? '開始・終了在庫確認' : 'Opening / closing stock checks'}</h2>
      <p style={{ ...mutedText, margin: '4px 0 10px', fontSize: 12 }}>
        {lang === 'ja'
          ? '全商品の入力が完了すると確認を確定できます。'
          : 'A check can be completed only after every required item is counted.'}
      </p>
      {feedback ? <p style={{ color: '#B42318', fontSize: 12 }}>{feedback}</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
        {(['opening', 'closing'] as const).map((type) => {
          const session = sessions.find((entry) => entry.checkType === type);
          const items = session ? itemsBySession[session.sessionId] ?? [] : [];
          const complete = session?.status === 'completed';
          return (
            <div key={type} style={{ ...card, marginTop: 0, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>
                  {type === 'opening'
                    ? lang === 'ja'
                      ? '開始時'
                      : 'Opening'
                    : lang === 'ja'
                      ? '終了時'
                      : 'Closing'}
                </strong>
                <span style={badgeStyle(complete ? 'active' : session ? 'warning' : 'neutral')}>
                  {complete
                    ? lang === 'ja'
                      ? '完了'
                      : 'Completed'
                    : session
                      ? `${session.countedItemCount}/${session.itemCount}`
                      : lang === 'ja'
                        ? '未開始'
                        : 'Not started'}
                </span>
              </div>
              {!session && !readOnly ? (
                <button type="button" style={{ ...buttonPrimary, marginTop: 10 }} disabled={pending} onClick={() => start(type)}>
                  {lang === 'ja' ? '確認を開始' : 'Start check'}
                </button>
              ) : null}
              {session && !complete ? (
                <>
                  <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
                    {items.map((item) => (
                      <form
                        key={item.sessionItemId}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const data = new FormData(event.currentTarget);
                          data.set('sessionId', session.sessionId);
                          data.set('itemId', item.itemId);
                          run(previewRecordInventorySessionItem, data);
                        }}
                        style={{ display: 'flex', alignItems: 'end', gap: 7 }}
                      >
                        <label style={{ flex: 1, fontSize: 12 }}>
                          {item.itemName} ({item.unit})
                          <span style={{ display: 'block', ...mutedText, fontSize: 11 }}>
                            {lang === 'ja' ? '目標' : 'Target'} {item.requiredQuantity} ·{' '}
                            {lang === 'ja' ? '発注点' : 'Reorder at'} {item.reorderPoint}
                          </span>
                          <input
                            name="actualQuantity"
                            type="number"
                            min={0}
                            step="0.001"
                            style={input}
                            defaultValue={item.actualQuantity ?? ''}
                            disabled={readOnly || pending}
                            required
                          />
                        </label>
                        {!readOnly ? (
                          <button type="submit" style={buttonSecondary} disabled={pending}>
                            {lang === 'ja' ? '保存' : 'Save'}
                          </button>
                        ) : null}
                      </form>
                    ))}
                  </div>
                  {!readOnly ? (
                    <button
                      type="button"
                      style={{
                        ...(session.itemCount > 0 && session.itemCount === session.countedItemCount ? buttonPrimary : buttonDisabled),
                        marginTop: 10,
                      }}
                      disabled={pending || session.itemCount === 0 || session.itemCount !== session.countedItemCount}
                      onClick={() => {
                        const data = new FormData();
                        data.set('sessionId', session.sessionId);
                        run(previewCompleteInventorySession, data);
                      }}
                    >
                      {lang === 'ja' ? '確認を完了' : 'Complete check'}
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
