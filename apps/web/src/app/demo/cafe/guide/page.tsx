import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'カフェ向けデモガイド | LINE Business OS',
  description:
    'LINE Business OSのカフェ向けデモガイド。LINEを入口に、スタッフ勤務、シフト確認、レシピ共有、店長ダッシュボードを確認できます。',
};

/**
 * Public-facing sales/demo landing page for the `/demo/cafe*` product demo.
 * Pure presentational page (no state, no LangProvider) — all copy is
 * deliberately future/implementation-tense (想定しています / 対応できます)
 * since no real LINE, Supabase, or payroll integration exists behind this demo.
 */

const colors = {
  green: '#2F6B45',
  greenDark: '#204A31',
  cream: '#FFF7EA',
  sand: '#F3E2C7',
  sandSoft: '#F8ECD8',
  charcoal: '#241A12',
  gold: '#C8913D',
  goldDark: '#9C6F28',
  mint: '#E6F2E8',
  white: '#FFFFFF',
  textMuted: 'rgba(36, 26, 18, 0.64)',
  border: 'rgba(36, 26, 18, 0.10)',
} as const;

const RADIUS = 16;

const guideStyles = `
  @keyframes cafeGuideFadeUp {
    from { opacity: 0; transform: translateY(28px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes cafeGuideFloatA {
    0%, 100% { transform: translateY(0) rotate(-3deg); }
    50% { transform: translateY(-12px) rotate(-2deg); }
  }
  @keyframes cafeGuideFloatB {
    0%, 100% { transform: translateY(0) rotate(2deg); }
    50% { transform: translateY(-16px) rotate(3deg); }
  }
  @keyframes cafeGuideFloatC {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-9px); }
  }
  .cafe-guide-fade {
    opacity: 0;
    animation: cafeGuideFadeUp 0.75s ease-out forwards;
  }
  .cafe-guide-float-a { animation: cafeGuideFloatA 6.5s ease-in-out infinite; }
  .cafe-guide-float-b { animation: cafeGuideFloatB 7.5s ease-in-out infinite; }
  .cafe-guide-float-c { animation: cafeGuideFloatC 5.5s ease-in-out infinite; }
  .cafe-guide-lift {
    transition: transform 0.25s ease, box-shadow 0.25s ease;
  }
  .cafe-guide-lift:hover {
    transform: translateY(-6px);
    box-shadow: 0 24px 44px rgba(36, 26, 18, 0.18);
  }
  .cafe-guide-btn {
    transition: transform 0.2s ease, filter 0.2s ease, box-shadow 0.2s ease;
  }
  .cafe-guide-btn:hover {
    transform: translateY(-2px);
    filter: brightness(1.05);
  }
  @media (max-width: 720px) {
    .cafe-guide-hero-visual { transform: scale(0.92); }
  }
`;

type ShotKey =
  | 'staffClockIn'
  | 'staffClockOut'
  | 'staffShiftOwn'
  | 'staffShiftRequestCalendar'
  | 'staffMessageShiftRequest'
  | 'recipeListDetail'
  | 'recipeMatchaDetail'
  | 'managerDashboard'
  | 'managerCorrectionDetail'
  | 'managerRecipeManagement'
  | 'managerSettings';

const SHOTS: Record<ShotKey, { file: string; w: number; h: number; alt: string }> = {
  staffClockIn: { file: 'staff-clock-in.png', w: 374, h: 231, alt: '出勤前のスタッフ勤務状況画面' },
  staffClockOut: { file: 'staff-clock-out.png', w: 373, h: 231, alt: '勤務中のスタッフ退勤画面' },
  staffShiftOwn: { file: 'staff-shift-own.png', w: 375, h: 299, alt: '自分のシフトと実働時間の確認画面' },
  staffShiftRequestCalendar: {
    file: 'staff-shift-request-calendar.png',
    w: 374,
    h: 795,
    alt: '来月のシフト希望をカレンダーから提出する画面',
  },
  staffMessageShiftRequest: {
    file: 'staff-message-shift-request.png',
    w: 375,
    h: 418,
    alt: '本日のメッセージとシフト希望提出済みの画面',
  },
  recipeListDetail: { file: 'recipe-list-detail.png', w: 374, h: 665, alt: 'レシピ一覧と抹茶ラテの詳細画面' },
  recipeMatchaDetail: {
    file: 'recipe-matcha-detail.png',
    w: 373,
    h: 623,
    alt: '抹茶ラテのレシピ詳細と抹茶液の作り方の補足画面',
  },
  managerDashboard: {
    file: 'manager-dashboard.png',
    w: 1241,
    h: 883,
    alt: '店長ダッシュボードの週間シフト表と要確認アラート画面',
  },
  managerCorrectionDetail: {
    file: 'manager-correction-detail.png',
    w: 1219,
    h: 725,
    alt: '勤務時間の修正依頼を確認する画面',
  },
  managerRecipeManagement: {
    file: 'manager-recipe-management.png',
    w: 1189,
    h: 774,
    alt: 'レシピ管理一覧画面',
  },
  managerSettings: { file: 'manager-settings.png', w: 1206, h: 784, alt: '店舗設定画面' },
};

export default function CafeDemoGuidePage() {
  return (
    <main style={{ background: colors.cream, color: colors.charcoal, overflowX: 'hidden' }}>
      <style>{guideStyles}</style>

      <Hero />

      <Band bg={colors.white}>
        <LineFirstSection />
      </Band>

      <Band bg={colors.mint}>
        <ProblemsSection />
      </Band>

      <Band bg={colors.white}>
        <WhatYouCanTestSection />
      </Band>

      <Band bg={colors.mint}>
        <ScreenHelpSection />
      </Band>

      <Band bg={colors.sandSoft}>
        <DemoUrlSection />
      </Band>

      <Band bg={colors.white}>
        <StaffAppSection />
      </Band>

      <Band bg={colors.mint}>
        <RecipeSection />
      </Band>

      <Band bg={colors.white}>
        <ManagerSection />
      </Band>

      <Band bg={colors.sandSoft}>
        <FlowSection />
      </Band>

      <Band bg={colors.white}>
        <BeforeAfterSection />
      </Band>

      <Band bg={colors.mint}>
        <ScopeSection />
      </Band>

      <Band bg={colors.white}>
        <ProductionSection />
      </Band>

      <FinalCTASection />
      <Footer />
    </main>
  );
}

/* ---------------------------------- Layout ---------------------------------- */

function Band({ bg, children }: { bg: string; children: ReactNode }) {
  return (
    <div style={{ background: bg }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '64px 24px' }}>{children}</div>
    </div>
  );
}

function Reveal({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: CSSProperties }) {
  return (
    <div className="cafe-guide-fade" style={{ animationDelay: `${delay}ms`, ...style }}>
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: 12.5,
        fontWeight: 800,
        letterSpacing: '0.08em',
        color: colors.green,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </p>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
  center,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  center?: boolean;
}) {
  return (
    <div style={{ textAlign: center ? 'center' : 'left', maxWidth: 760, margin: center ? '0 auto' : undefined }}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 style={{ margin: '8px 0 0', fontSize: 'clamp(22px, 3vw, 32px)', lineHeight: 1.4, fontWeight: 800 }}>
        {title}
      </h2>
      {subtitle ? (
        <p style={{ margin: '14px 0 0', fontSize: 15.5, lineHeight: 1.9, color: colors.textMuted }}>{subtitle}</p>
      ) : null}
    </div>
  );
}

function Grid({ minWidth, children }: { minWidth: number; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`, gap: 16 }}>
      {children}
    </div>
  );
}

/* ---------------------------------- Buttons ---------------------------------- */

function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="cafe-guide-btn"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '14px 24px',
        borderRadius: 999,
        background: `linear-gradient(135deg, ${colors.green}, ${colors.greenDark})`,
        color: colors.white,
        fontSize: 15,
        fontWeight: 700,
        textDecoration: 'none',
        boxShadow: '0 10px 24px rgba(47, 107, 69, 0.28)',
      }}
    >
      {children}
    </Link>
  );
}

function SecondaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="cafe-guide-btn"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '13px 22px',
        borderRadius: 999,
        background: colors.white,
        color: colors.charcoal,
        border: `1.5px solid ${colors.border}`,
        fontSize: 15,
        fontWeight: 700,
        textDecoration: 'none',
      }}
    >
      {children}
    </Link>
  );
}

/* ---------------------------------- Frames ---------------------------------- */

function PhoneFrame({
  shot,
  width = 200,
  floatClass,
  style,
}: {
  shot: (typeof SHOTS)[ShotKey];
  width?: number;
  floatClass?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={['cafe-guide-lift', floatClass].filter(Boolean).join(' ')}
      style={{
        width,
        maxWidth: '100%',
        borderRadius: 26,
        border: `7px solid ${colors.charcoal}`,
        background: colors.charcoal,
        boxShadow: '0 20px 40px rgba(36, 26, 18, 0.22)',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div style={{ height: 16, background: colors.charcoal, position: 'relative' }}>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 5,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 46,
            height: 5,
            borderRadius: 4,
            background: 'rgba(255,255,255,0.28)',
          }}
        />
      </div>
      <div style={{ background: colors.white, lineHeight: 0 }}>
        <Image
          src={`/demo/cafe/guide/screenshots/${shot.file}`}
          alt={shot.alt}
          width={shot.w}
          height={shot.h}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          sizes={`${width}px`}
        />
      </div>
    </div>
  );
}

function BrowserFrame({
  shot,
  wide,
  floatClass,
  style,
}: {
  shot: (typeof SHOTS)[ShotKey];
  wide?: boolean;
  floatClass?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={['cafe-guide-lift', floatClass].filter(Boolean).join(' ')}
      style={{
        width: wide ? 560 : 340,
        maxWidth: '100%',
        borderRadius: RADIUS,
        border: `1px solid ${colors.border}`,
        background: colors.white,
        boxShadow: '0 20px 44px rgba(36, 26, 18, 0.16)',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '10px 12px',
          background: colors.sandSoft,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: '#E29A8A' }} />
        <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: '#E8C77E' }} />
        <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: '#8FBB98' }} />
        <span
          style={{
            marginLeft: 8,
            flex: 1,
            fontSize: 11,
            color: colors.textMuted,
            background: colors.white,
            borderRadius: 999,
            padding: '3px 10px',
            border: `1px solid ${colors.border}`,
          }}
        >
          app.line-business-os.jp/demo/cafe
        </span>
      </div>
      <div style={{ lineHeight: 0 }}>
        <Image
          src={`/demo/cafe/guide/screenshots/${shot.file}`}
          alt={shot.alt}
          width={shot.w}
          height={shot.h}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          sizes={`${wide ? 560 : 340}px`}
        />
      </div>
    </div>
  );
}

/* ---------------------------------- Hero ---------------------------------- */

function Hero() {
  return (
    <div style={{ background: `linear-gradient(180deg, ${colors.mint} 0%, ${colors.cream} 60%)` }}>
      <div
        style={{
          maxWidth: 1160,
          margin: '0 auto',
          padding: '56px 24px 40px',
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1fr) minmax(280px, 1fr)',
          gap: 40,
          alignItems: 'center',
        }}
      >
        <Reveal>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                display: 'inline-flex',
                padding: '5px 12px',
                borderRadius: 999,
                background: colors.white,
                border: `1px solid ${colors.border}`,
                fontSize: 12.5,
                fontWeight: 800,
                color: colors.green,
              }}
            >
              LINE Business OS
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.textMuted }}>カフェ向け公開デモ</span>
          </div>

          <h1 style={{ margin: '20px 0 0', fontSize: 'clamp(28px, 4.2vw, 44px)', lineHeight: 1.35, fontWeight: 800 }}>
            LINE Business OS
            <br />
            カフェ向けスタッフ・レシピ・シフト管理デモ
          </h1>

          <p style={{ margin: '18px 0 0', fontSize: 16.5, lineHeight: 1.9 }}>
            LINEから、勤務・シフト・レシピ確認まで。
            <br />
            スタッフが普段使っているLINEを入口に、店舗業務をひとつにつなげるデモです。
          </p>

          <p style={{ margin: '14px 0 0', fontSize: 13.5, lineHeight: 1.9, color: colors.textMuted }}>
            本デモはブラウザ上で確認できます。本番導入時には、LINE公式アカウント、リッチメニュー、LIFF、Webアプリを組み合わせた運用導線を想定しています。
          </p>

          <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <PrimaryButton href="/demo/cafe/staff">スタッフ用デモを見る</PrimaryButton>
            <SecondaryButton href="/demo/cafe/recipes">レシピ共有を見る</SecondaryButton>
            <SecondaryButton href="/demo/cafe/manager">店長ダッシュボードを見る</SecondaryButton>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div
            className="cafe-guide-hero-visual"
            style={{
              position: 'relative',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'flex-start',
              gap: 18,
              paddingTop: 8,
            }}
          >
            <PhoneFrame shot={SHOTS.staffClockOut} width={168} floatClass="cafe-guide-float-a" />
            <PhoneFrame
              shot={SHOTS.recipeListDetail}
              width={168}
              floatClass="cafe-guide-float-b"
              style={{ marginTop: 32 }}
            />
            <div style={{ flexBasis: '100%', display: 'flex', justifyContent: 'center' }}>
              <BrowserFrame
                shot={SHOTS.managerDashboard}
                wide
                floatClass="cafe-guide-float-c"
                style={{ marginTop: -12 }}
              />
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

/* ---------------------------------- LINE-first section ---------------------------------- */

function LineFirstSection() {
  const badges = ['LINE Official Account', 'Rich Menu', 'LIFF', 'Web App', 'No app install'];
  return (
    <Reveal>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1.1fr) minmax(240px, 0.9fr)', gap: 40 }}>
        <div>
          <SectionHeading eyebrow="LINEを入口に" title="いつものLINEから、店舗業務アプリへ" />
          <p style={{ margin: '18px 0 0', fontSize: 15, lineHeight: 1.95, color: colors.textMuted }}>
            多くの店舗では、スタッフへの連絡、シフト確認、作業手順の共有がLINE・紙・口頭・スプレッドシートに分かれています。
          </p>
          <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.95, color: colors.textMuted }}>
            LINE Business OSは、スタッフが普段使い慣れているLINEを入口にして、勤務記録、シフト確認、レシピ確認、店長への連絡をひとつの業務導線にまとめることを目指しています。
          </p>
          <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.95, color: colors.textMuted }}>
            本番導入時には、LINE公式アカウントのリッチメニューからLIFFまたはWebアプリを開き、スタッフが新しい専用アプリを覚えなくても使いやすい形で提供できます。
          </p>
          <div style={{ marginTop: 22, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {badges.map((label) => (
              <Badge key={label} label={label} />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16, alignItems: 'flex-start' }}>
          <PhoneFrame shot={SHOTS.staffClockIn} width={140} floatClass="cafe-guide-float-a" />
          <PhoneFrame shot={SHOTS.staffShiftOwn} width={140} floatClass="cafe-guide-float-b" style={{ marginTop: 26 }} />
          <PhoneFrame
            shot={SHOTS.recipeMatchaDetail}
            width={140}
            floatClass="cafe-guide-float-c"
            style={{ marginTop: 4 }}
          />
        </div>
      </div>
    </Reveal>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span
      style={{
        padding: '6px 14px',
        borderRadius: 999,
        background: colors.mint,
        color: colors.greenDark,
        fontSize: 12.5,
        fontWeight: 700,
        border: `1px solid rgba(47, 107, 69, 0.18)`,
      }}
    >
      {label}
    </span>
  );
}

/* ---------------------------------- Problems ---------------------------------- */

function ProblemsSection() {
  const pains = [
    { icon: '💬', text: 'シフト確認がLINE・紙・口頭に分散' },
    { icon: '🔁', text: '勤務時間の修正依頼が曖昧' },
    { icon: '🎓', text: '新人スタッフへの教育コストが高い' },
    { icon: '🌏', text: '外国人スタッフへの説明が難しい' },
    { icon: '🧮', text: '月末集計に時間がかかる' },
    { icon: '👀', text: '店長が確認すべきことを見落としやすい' },
  ];
  return (
    <Reveal>
      <SectionHeading eyebrow="店舗の課題" title="このデモが解決する店舗課題" center />
      <div style={{ marginTop: 32 }}>
        <Grid minWidth={220}>
          {pains.map((pain) => (
            <div
              key={pain.text}
              className="cafe-guide-lift"
              style={{
                background: colors.white,
                border: `1px solid ${colors.border}`,
                borderRadius: RADIUS,
                padding: '22px 20px',
              }}
            >
              <div style={{ fontSize: 26 }}>{pain.icon}</div>
              <p style={{ margin: '12px 0 0', fontSize: 14.5, fontWeight: 700, lineHeight: 1.6 }}>{pain.text}</p>
            </div>
          ))}
        </Grid>
      </div>
    </Reveal>
  );
}

/* ---------------------------------- What you can test ---------------------------------- */

function WhatYouCanTestSection() {
  const items = [
    { icon: '🧑‍🍳', title: 'スタッフ用アプリ', text: '出退勤・休憩・シフト確認をスマートフォンで。' },
    { icon: '📖', title: 'レシピ共有', text: '材料・作り方をスマートフォンでいつでも確認。' },
    { icon: '📊', title: '店長ダッシュボード', text: '週間シフトと要確認アラートを一画面で管理。' },
    { icon: '🌐', title: '日本語 / English 表示', text: 'スタッフ用画面は言語をワンタップで切替。' },
    { icon: '🧾', title: '月間レポートCSV（デモ）', text: '月間の勤務時間・交通費を概算で表示。' },
    { icon: '💡', title: 'LINE導線を想定した構成', text: '将来のLINEリッチメニュー導線を想定した画面構成。' },
  ];
  return (
    <Reveal>
      <SectionHeading eyebrow="確認できること" title="このデモで確認できること" center />
      <div style={{ marginTop: 32 }}>
        <Grid minWidth={230}>
          {items.map((item) => (
            <div
              key={item.title}
              className="cafe-guide-lift"
              style={{
                background: colors.white,
                border: `1px solid ${colors.border}`,
                borderRadius: RADIUS,
                padding: '22px 20px',
              }}
            >
              <div style={{ fontSize: 24 }}>{item.icon}</div>
              <p style={{ margin: '10px 0 0', fontSize: 15, fontWeight: 700 }}>{item.title}</p>
              <p style={{ margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.7, color: colors.textMuted }}>{item.text}</p>
            </div>
          ))}
        </Grid>
      </div>
    </Reveal>
  );
}

/* ---------------------------------- Screen help ---------------------------------- */

function ScreenHelpSection() {
  const items = [
    '出勤・休憩の操作を確認',
    'シフト表の見方を確認',
    'レシピ手順の意味を確認',
    '店長ダッシュボードの使い方を確認',
  ];
  return (
    <Reveal>
      <SectionHeading eyebrow="画面内ヘルプ" title="迷わず使える画面内ヘルプ" center />
      <p
        style={{
          margin: '18px auto 0',
          maxWidth: 640,
          fontSize: 14.5,
          lineHeight: 1.9,
          color: colors.textMuted,
          textAlign: 'center',
        }}
      >
        各画面には「？」のヘルプを用意しています。スタッフや店長が操作に迷ったとき、出勤・休憩・シフト確認・レシピ確認・月間レポートの意味を画面上で確認できます。
      </p>
      <p
        style={{
          margin: '10px auto 0',
          maxWidth: 640,
          fontSize: 14.5,
          lineHeight: 1.9,
          color: colors.textMuted,
          textAlign: 'center',
        }}
      >
        導入直後の説明負担を減らし、新人スタッフや外国人スタッフにも使い方を伝えやすくするための仕組みです。
      </p>
      <div style={{ marginTop: 22, display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
        {items.map((label) => (
          <HelpPill key={label} label={label} />
        ))}
      </div>
    </Reveal>
  );
}

function HelpPill({ label }: { label: string }) {
  return (
    <span
      className="cafe-guide-lift"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        borderRadius: 999,
        background: colors.white,
        border: `1px solid ${colors.border}`,
        fontSize: 13.5,
        fontWeight: 700,
        color: colors.charcoal,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          flexShrink: 0,
          width: 18,
          height: 18,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          background: colors.mint,
          color: colors.greenDark,
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        ?
      </span>
      {label}
    </span>
  );
}

/* ---------------------------------- Demo URL cards ---------------------------------- */

function DemoUrlSection() {
  const demos = [
    {
      title: 'スタッフ用アプリ',
      path: '/demo/cafe/staff',
      value: '出勤から退勤、シフト確認まで。スタッフが毎日開く入口になる画面です。',
      device: 'スマートフォン推奨',
      features: ['出退勤・休憩の記録', 'シフト・本日のメッセージ確認', '来月のシフト希望提出', 'JA / EN 切替'],
    },
    {
      title: 'レシピ共有',
      path: '/demo/cafe/recipes',
      value: '材料や作り方を、口頭説明に頼らずスマートフォンで確認できます。',
      device: 'スマートフォン推奨',
      features: ['メニューごとの材料・作り方', '補足レシピ（例: 抹茶液の作り方）', 'JA / EN 切替'],
    },
    {
      title: '店長ダッシュボード',
      path: '/demo/cafe/manager',
      value: 'シフト表、要確認、月間レポートを一画面で確認できます。',
      device: 'デスクトップ / タブレット推奨',
      features: ['週間シフト表と要確認アラート', '月間レポートCSV（デモ）', 'スタッフ・レシピ管理'],
    },
  ];
  return (
    <Reveal>
      <SectionHeading eyebrow="デモURL" title="3つのデモをすぐに確認できます" center />
      <div style={{ marginTop: 32 }}>
        <Grid minWidth={280}>
          {demos.map((demo) => (
            <div
              key={demo.path}
              className="cafe-guide-lift"
              style={{
                background: colors.white,
                border: `1px solid ${colors.border}`,
                borderRadius: RADIUS,
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <p style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{demo.title}</p>
              <code style={{ marginTop: 4, fontSize: 12.5, color: colors.textMuted }}>{demo.path}</code>
              <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.8, color: colors.textMuted, flex: 1 }}>
                {demo.value}
              </p>
              <span
                style={{
                  marginTop: 14,
                  alignSelf: 'flex-start',
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: colors.goldDark,
                  background: 'rgba(200, 145, 61, 0.14)',
                  padding: '4px 10px',
                  borderRadius: 999,
                }}
              >
                {demo.device}
              </span>
              <ul style={{ margin: '14px 0 0', padding: 0, listStyle: 'none' }}>
                {demo.features.map((feature) => (
                  <li
                    key={feature}
                    style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 13, color: colors.charcoal }}
                  >
                    <span aria-hidden="true" style={{ color: colors.green }}>
                      ✓
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 18 }}>
                <PrimaryButton href={demo.path}>開く</PrimaryButton>
              </div>
            </div>
          ))}
        </Grid>
      </div>
    </Reveal>
  );
}

/* ---------------------------------- Staff app ---------------------------------- */

function StaffAppSection() {
  return (
    <Reveal>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 0.9fr) minmax(280px, 1.1fr)', gap: 40 }}>
        <div>
          <SectionHeading eyebrow="/demo/cafe/staff" title="スタッフ用アプリ" />
          <p style={{ margin: '18px 0 0', fontSize: 15, lineHeight: 1.95, color: colors.textMuted }}>
            出勤・退勤・休憩、シフト確認、交通費、本日のメッセージ、来月のシフト希望をスマートフォンで確認できます。
          </p>
          <div style={{ marginTop: 20 }}>
            <SecondaryButton href="/demo/cafe/staff">スタッフ用デモを見る</SecondaryButton>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 18, alignItems: 'flex-start' }}>
          <PhoneFrame shot={SHOTS.staffClockOut} width={190} floatClass="cafe-guide-float-a" />
          <PhoneFrame
            shot={SHOTS.staffShiftOwn}
            width={150}
            floatClass="cafe-guide-float-b"
            style={{ marginTop: 30 }}
          />
          <PhoneFrame
            shot={SHOTS.staffShiftRequestCalendar}
            width={150}
            floatClass="cafe-guide-float-c"
          />
        </div>
      </div>
    </Reveal>
  );
}

/* ---------------------------------- Recipe sharing ---------------------------------- */

function RecipeSection() {
  return (
    <Reveal>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1.1fr) minmax(280px, 0.9fr)', gap: 40 }}>
        <div>
          <SectionHeading eyebrow="/demo/cafe/recipes" title="レシピ共有" />
          <p style={{ margin: '18px 0 0', fontSize: 15, lineHeight: 1.95, color: colors.textMuted }}>
            新人スタッフや外国人スタッフでも、スマートフォンから材料・作り方・補足メモを確認できます。口頭説明に頼らず、店舗の品質をそろえるための機能です。
          </p>
          <div style={{ marginTop: 20 }}>
            <SecondaryButton href="/demo/cafe/recipes">レシピ共有を見る</SecondaryButton>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 18 }}>
          <PhoneFrame shot={SHOTS.recipeListDetail} width={190} floatClass="cafe-guide-float-a" />
          <PhoneFrame
            shot={SHOTS.recipeMatchaDetail}
            width={190}
            floatClass="cafe-guide-float-b"
            style={{ marginTop: 24 }}
          />
        </div>
      </div>
    </Reveal>
  );
}

/* ---------------------------------- Manager dashboard ---------------------------------- */

function ManagerSection() {
  return (
    <Reveal>
      <SectionHeading eyebrow="/demo/cafe/manager" title="店長ダッシュボード" />
      <p style={{ margin: '18px 0 0', fontSize: 15, lineHeight: 1.95, color: colors.textMuted, maxWidth: 720 }}>
        シフト表、要確認、勤務修正依頼、月間レポート、スタッフ管理、レシピ管理、店舗設定を一つの画面で確認できます。
      </p>
      <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center' }}>
        <BrowserFrame shot={SHOTS.managerDashboard} wide floatClass="cafe-guide-float-c" />
      </div>
      <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 18 }}>
        <BrowserFrame shot={SHOTS.managerCorrectionDetail} floatClass="cafe-guide-float-a" />
        <BrowserFrame shot={SHOTS.managerRecipeManagement} floatClass="cafe-guide-float-b" />
        <BrowserFrame shot={SHOTS.managerSettings} floatClass="cafe-guide-float-c" />
      </div>
      <div style={{ marginTop: 24 }}>
        <SecondaryButton href="/demo/cafe/manager">店長ダッシュボードを見る</SecondaryButton>
      </div>
    </Reveal>
  );
}

/* ---------------------------------- Demo flow ---------------------------------- */

function FlowSection() {
  const steps = [
    'スタッフがLINEから勤務アプリを開く',
    '出勤・休憩・退勤を記録する',
    'レシピを確認して作業する',
    '店長がダッシュボードで状況を確認する',
    '月末に勤務時間・交通費を確認する',
  ];
  return (
    <Reveal>
      <SectionHeading eyebrow="体験の流れ" title="デモで体験できる流れ" center />
      <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center' }}>
        {steps.map((step, index) => (
          <div
            key={step}
            className="cafe-guide-lift"
            style={{
              flex: '1 1 200px',
              maxWidth: 230,
              background: colors.white,
              border: `1px solid ${colors.border}`,
              borderRadius: RADIUS,
              padding: '20px 18px',
              textAlign: 'center',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${colors.green}, ${colors.greenDark})`,
                color: colors.white,
                fontSize: 14,
                fontWeight: 800,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {index + 1}
            </span>
            <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.7 }}>{step}</p>
          </div>
        ))}
      </div>
    </Reveal>
  );
}

/* ---------------------------------- Before / After ---------------------------------- */

function BeforeAfterSection() {
  const before = [
    'シフト表を紙・Excel・LINEで管理',
    'レシピ共有は口頭・写真・個別メッセージ',
    '修正依頼を手作業で確認',
    '月末集計に手間がかかる',
  ];
  const after = [
    'スタッフはLINEから業務アプリを開く',
    'レシピをスマートフォンで確認',
    '修正依頼を画面で確認',
    '店長は要確認事項と月間集計を確認',
  ];
  return (
    <Reveal>
      <SectionHeading eyebrow="Before / After" title="導入前 / 導入後のイメージ" center />
      <div style={{ marginTop: 28 }}>
        <Grid minWidth={280}>
          <div style={{ background: colors.white, border: `1px solid ${colors.border}`, borderRadius: RADIUS, padding: 24 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: colors.textMuted }}>導入前</p>
            <ul style={{ margin: '14px 0 0', padding: 0, listStyle: 'none' }}>
              {before.map((item) => (
                <li key={item} style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: 14, lineHeight: 1.7 }}>
                  <span aria-hidden="true">・</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div
            style={{
              background: colors.mint,
              border: `1px solid rgba(47, 107, 69, 0.2)`,
              borderRadius: RADIUS,
              padding: 24,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: colors.greenDark }}>
              導入後（デモで体験できるイメージ）
            </p>
            <ul style={{ margin: '14px 0 0', padding: 0, listStyle: 'none' }}>
              {after.map((item) => (
                <li key={item} style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: 14, lineHeight: 1.7 }}>
                  <span aria-hidden="true" style={{ color: colors.green }}>
                    →
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </Grid>
      </div>
    </Reveal>
  );
}

/* ---------------------------------- Demo scope ---------------------------------- */

function ScopeSection() {
  const items = [
    'このデモはブラウザ上で動作する確認用デモです。',
    '実店舗データは保存していません。',
    '月間レポートは確認用のデモ表示です。',
    '給与計算システムではありません。',
    'LINE連携、実データ保存、権限管理、認証、店舗別データ管理は本番導入時に設計します。',
  ];
  return (
    <Reveal>
      <SectionHeading eyebrow="ご確認ください" title="デモ範囲" center />
      <div
        style={{
          marginTop: 24,
          maxWidth: 720,
          margin: '24px auto 0',
          background: colors.white,
          border: `1px solid rgba(200, 145, 61, 0.3)`,
          borderRadius: RADIUS,
          padding: 24,
        }}
      >
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {items.map((item) => (
            <li key={item} style={{ display: 'flex', gap: 10, marginTop: 10, fontSize: 14, lineHeight: 1.8 }}>
              <span aria-hidden="true">⚠️</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );
}

/* ---------------------------------- Production implementation ---------------------------------- */

function ProductionSection() {
  const items = [
    'LINE Official Account / Rich Menu 連携',
    'LIFF または Web App 導線',
    'スタッフ情報管理',
    '勤務記録の保存',
    'シフト希望の収集',
    'レシピ管理',
    '月間CSV出力',
    '多店舗対応',
    '権限管理',
    'データ保護',
  ];
  return (
    <Reveal>
      <SectionHeading eyebrow="導入時にできること" title="本番導入時にできること" center />
      <div style={{ marginTop: 28 }}>
        <Grid minWidth={220}>
          {items.map((item) => (
            <div
              key={item}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                background: colors.white,
                border: `1px solid ${colors.border}`,
                borderRadius: RADIUS,
                padding: '16px 18px',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <span aria-hidden="true" style={{ color: colors.green, fontSize: 16 }}>
                ✓
              </span>
              <span>{item}</span>
            </div>
          ))}
        </Grid>
      </div>
    </Reveal>
  );
}

/* ---------------------------------- Final CTA ---------------------------------- */

function FinalCTASection() {
  return (
    <div style={{ background: `linear-gradient(135deg, ${colors.green}, ${colors.greenDark})` }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '72px 24px', textAlign: 'center' }}>
        <Reveal>
          <h2 style={{ margin: 0, fontSize: 'clamp(22px, 3.4vw, 30px)', fontWeight: 800, color: colors.white }}>
            まずは、店舗の運用に合わせて小さく始められます
          </h2>
          <p style={{ margin: '18px auto 0', maxWidth: 620, fontSize: 15, lineHeight: 1.9, color: 'rgba(255,255,255,0.88)' }}>
            最初からすべてを置き換える必要はありません。スタッフ用アプリ、レシピ共有、店長ダッシュボードの中から、効果が出やすい部分を選んで導入できます。
          </p>
          <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            <Link
              href="/demo/cafe/staff"
              className="cafe-guide-btn"
              style={{
                display: 'inline-flex',
                padding: '14px 26px',
                borderRadius: 999,
                background: colors.white,
                color: colors.greenDark,
                fontSize: 15,
                fontWeight: 800,
                textDecoration: 'none',
                boxShadow: '0 12px 28px rgba(0,0,0,0.18)',
              }}
            >
              スタッフ用デモを見る
            </Link>
            <Link
              href="/demo/cafe/manager"
              className="cafe-guide-btn"
              style={{
                display: 'inline-flex',
                padding: '14px 26px',
                borderRadius: 999,
                background: 'transparent',
                color: colors.white,
                border: '1.5px solid rgba(255,255,255,0.6)',
                fontSize: 15,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              店長ダッシュボードを見る
            </Link>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

/* ---------------------------------- Footer ---------------------------------- */

function Footer() {
  return (
    <footer style={{ background: colors.cream }}>
      <div
        style={{
          maxWidth: 1160,
          margin: '0 auto',
          padding: '28px 24px',
          borderTop: `1px solid ${colors.border}`,
        }}
      >
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>IZUMI IT / LINE Business OS</p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: colors.textMuted }}>
          This guide is for demo review only.
        </p>
      </div>
    </footer>
  );
}
