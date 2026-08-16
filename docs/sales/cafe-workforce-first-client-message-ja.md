# Cafe Workforce — ギュウさん向け ファーストメッセージ（下書き）

Status: **下書き。送信前に必ず内容を確認し、プレースホルダーを実際のURLに置き換えること。**

Read with: [`cafe-workforce-demo-script-ja.md`](./cafe-workforce-demo-script-ja.md),
[`cafe-workforce-pilot-package-ja.md`](./cafe-workforce-pilot-package-ja.md).

## 目的

最初のカフェクライアント候補（ギュウさん）に、LINEまたはチャットでそのまま送れる
メッセージ文面を用意する。デモガイドページの案内、8週間無料の開発協力パイロット
の提案、料金の見込み、非payroll・非法定勤怠管理である旨を明示し、率直な感想を
求める。

## 送信前に置き換えるプレースホルダー

| プレースホルダー | 内容 |
| --- | --- |
| `{{DEMO_GUIDE_URL}}` | `/demo/cafe/guide` の実URL |
| `{{STAFF_DEMO_URL}}` | `/demo/cafe` の実URL |
| `{{RECIPE_DEMO_URL}}` | `/demo/cafe/recipes` の実URL |
| `{{MANAGER_DEMO_URL}}` | `/demo/cafe/manager` の実URL |

## メッセージ本文

```
ギュウさん

いつもお世話になっております。

先日お話しした「LINEで使えるカフェ運営ミニOS」のデモが形になったので、
まずはご覧いただけたら嬉しいです。

全体像がわかるガイドページはこちらです。
{{DEMO_GUIDE_URL}}

ガイドの中から、実際に触れる3つのデモ画面にもリンクしています。

1. スタッフアプリ（出勤・退勤、休憩、週間シフト確認、交通費・日報入力など）
{{STAFF_DEMO_URL}}

2. レシピ・マニュアル共有（メニューの作り方をLINEでいつでも確認できる仕組み）
{{RECIPE_DEMO_URL}}

3. 店長ダッシュボード（週間シフト管理、要確認アラート、月次レポートなど）
{{MANAGER_DEMO_URL}}

今の段階はまだ「確認用のデモ」です。実際のデータ保存やLINE連携はこれから
設計する部分になります。また、給与計算や、法律上必要な勤怠管理を代わりに
行うものでもありません。まずは「こういう形なら実際の店舗運営で使えそうか」
を一緒に確認させていただきたいと思っています。

もしよろしければ、開発協力パイロットという形で、8週間無料でお試しいただけ
たらと思っています。

- 初期費用: 0円（今回、開発協力の第一号としてお願いする特別対応です）
- 8週間の無料期間終了後、継続していただく場合は月額4,980円（税別）
- LINE公式アカウントのご利用にともなう費用が発生する場合は、別途となります

一般公開時の正式な料金プランとは別枠の、開発協力先限定のご案内です。

実際の店舗の運用に合わせて、使いにくい部分や、こういう機能が欲しいという
点があれば、率直に教えていただけるととても助かります。

お忙しいところ恐縮ですが、まずはガイドページを見ていただいて、ご感想や
ご意見をお聞かせいただけますでしょうか。

よろしくお願いいたします。
```

## 送信後のフォローアップ

- 返信があれば [`cafe-workforce-demo-script-ja.md`](./cafe-workforce-demo-script-ja.md)
  に沿って、画面共有または対面でのデモに進む。
- 前向きな反応があれば
  [`cafe-workforce-client-interview-checklist-ja.md`](./cafe-workforce-client-interview-checklist-ja.md)
  を使ってヒアリングに進む。
- パイロット合意に進む場合は
  [`cafe-workforce-pilot-package-ja.md`](./cafe-workforce-pilot-package-ja.md) の内容を
  そのまま提示できる。
