# Supabase Auth email templates — Japanese (+ English): Invite user and Reset password

DEBT-083 (English-only invite) and DEBT-085 (Reset password link does not
reach the password screen). These are Supabase Dashboard settings, not code.
Where: **Supabase Dashboard → Authentication → Emails → Templates**
(Cloud DEV project first; Production later, separately).

## Why the links look like this

Both emails must land on ORUWA's own callback
`/auth/accept-invite?invitation_id=...&token_hash=...&type=...`
(`apps/web/src/app/auth/accept-invite/route.ts`, PR #233). That route
verifies the token server-side and opens the password screen
(`/auth/accept-invite/set-password`). `{{ .RedirectTo }}` already contains
`.../auth/accept-invite?invitation_id=<id>` (set by the `invite-employee`
Edge Function), so the template only appends the token.

Do **not** use `{{ .ConfirmationURL }}`: it produces a
`#access_token=...` link that the app deliberately ignores (2026-10-08: the
"Reset password" link opened the Manager screen instead of the password
screen because the Reset password template still used it).

## 1. Invite user

Subject:

```
【ORUWA】スタッフアカウントへの招待 / You're invited to ORUWA
```

Body:

```html
<h2>ORUWAへようこそ</h2>
<p>店舗のスタッフとしてORUWAに招待されました。</p>
<p>下のボタンからパスワードを設定すると、シフトの確認や勤怠の記録ができるようになります。</p>
<p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite" style="display:inline-block;padding:12px 20px;background:#4F7A4F;color:#ffffff;text-decoration:none;border-radius:8px;">招待を受けてパスワードを設定する</a></p>
<p style="color:#666;font-size:13px;">このリンクには有効期限があります。期限が切れた場合は、店長に再送信を依頼してください。<br>
お心当たりのない場合は、このメールを破棄してください。</p>
<hr>
<p style="color:#666;font-size:13px;">You have been invited to ORUWA as a staff member of your store.
Use the button above to set your password. The link expires after a while; if it expires, ask your manager to resend it.
If you did not expect this email, you can ignore it.</p>
```

## 2. Reset password (used by the Manager's "アクセスを回復")

Subject:

```
【ORUWA】パスワードの設定 / Set your ORUWA password
```

Body:

```html
<h2>パスワードの設定</h2>
<p>ORUWAのパスワードを設定するためのメールです。店長の操作、またはパスワード再設定の依頼により送信されました。</p>
<p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery" style="display:inline-block;padding:12px 20px;background:#4F7A4F;color:#ffffff;text-decoration:none;border-radius:8px;">パスワードを設定する</a></p>
<p style="color:#666;font-size:13px;">このリンクには有効期限があります。期限が切れた場合は、店長に再送信を依頼してください。<br>
お心当たりのない場合は、このメールを破棄してください。</p>
<hr>
<p style="color:#666;font-size:13px;">Use the button above to set your ORUWA password. This email was sent at your manager's request or because a password reset was requested.
The link expires after a while; if it expires, ask your manager to resend it. If you did not expect this email, you can ignore it.</p>
```

## Check after saving

Open each link in a **private/incognito window** (not a browser where a
Manager is already signed in).

1. Invite: Manager → スタッフ管理 → test employee (Founder alias e-mail) →
   招待する → email in Japanese → button → password screen → set password →
   Staff screen. Then 完全に削除 the test employee.
2. Reset password: Manager → スタッフ管理 → 佐藤 陽介 → アクセスを回復 →
   email in Japanese → button → password screen → set password → Staff screen.

If a button opens the sign-in page with an error or a page with
`#access_token=` in the address, the `href` is not exactly as above.
