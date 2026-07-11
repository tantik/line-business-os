'use client';

import Link from 'next/link';
import { BrandMark } from '@/components/demo/cafe/BrandMark';
import { card, demoColors, mobilePageStyle, mutedText } from '@/lib/demo/cafe/theme';
import { useBrand } from '@/lib/demo/brand';

interface HubCard {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  device: string;
}

const CARDS: HubCard[] = [
  {
    href: 'staff',
    eyebrow: 'スタッフ用アプリ',
    title: '出退勤・シフト確認',
    description: '出勤から退勤、休憩、来月のシフト希望提出まで。スタッフが毎日開く入口になる画面です。',
    device: 'スマートフォン推奨',
  },
  {
    href: 'manager',
    eyebrow: '店長ダッシュボード',
    title: 'シフト表・労務管理',
    description: '週間シフト表、要確認アラート、人件費サマリー、月間レポートを一画面で確認できます。',
    device: 'デスクトップ / タブレット推奨',
  },
  {
    href: 'recipes',
    eyebrow: 'レシピ共有',
    title: 'メニュー・作り方',
    description: '材料や作り方を、口頭説明に頼らずスマートフォンでいつでも確認できます。',
    device: 'スマートフォン推奨',
  },
];

/** Premium product-overview landing for the cafe demo package. Shared by `/demo/cafe` and `/mame-to-cha`. */
export function HubView() {
  const brand = useBrand();

  return (
    <main style={mobilePageStyle(820)}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <BrandMark size={56} />
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{brand.nameJa}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, ...mutedText }}>{brand.taglineJa}</p>
        </div>
      </header>

      <p style={{ margin: '20px 0 0', fontSize: 14.5, lineHeight: 1.9, ...mutedText }}>
        LINEから、勤務・シフト・レシピ確認まで。カフェの店舗業務をひとつにつなげる公開デモです（サンプルデータ）。
        下の3画面から確認できます。
      </p>

      <div style={{ marginTop: 24, display: 'grid', gap: 14 }}>
        {CARDS.map((item) => (
          <Link
            key={item.href}
            href={`${brand.homePath}/${item.href}`}
            style={{
              ...card,
              margin: 0,
              display: 'block',
              textDecoration: 'none',
              color: 'inherit',
              transition: 'box-shadow 0.15s ease, transform 0.15s ease',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                fontSize: 12,
                fontWeight: 700,
                color: demoColors.accentStrong,
                background: demoColors.accentMuted,
                borderRadius: 999,
                padding: '3px 10px',
              }}
            >
              {item.eyebrow}
            </span>
            <h2 style={{ margin: '10px 0 0', fontSize: 18, fontWeight: 800 }}>{item.title}</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.7, ...mutedText }}>{item.description}</p>
            <p style={{ margin: '10px 0 0', fontSize: 12, fontWeight: 600, color: demoColors.textMuted }}>{item.device}</p>
          </Link>
        ))}
      </div>

      <p style={{ margin: '28px 0 0', fontSize: 12, ...mutedText }}>
        本デモはブラウザ上で確認できる公開サンプルです。実データの書き込みは行われません。
      </p>
    </main>
  );
}
