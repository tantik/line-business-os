# Supabase Invite email template — Japanese (+ English) version

DEBT-083. The current Invite email ("You've been invited / Accept invitation")
is English only. This is a Supabase Dashboard setting, not code: the Founder
pastes it in **Supabase Dashboard → Authentication → Emails → Templates →
Invite user** (Cloud DEV project first; Production later, separately).

## The one rule

**Do not change the link (`href`).** The current template's link carries
`token_hash` + `type=invite` for the server-side `verifyOtp` callback
(`apps/web/src/app/auth/accept-invite/route.ts`, PR #233). Copy the existing
`href="..."` value exactly as it is in the Dashboard today and paste it into
the `href` below where it says `KEEP_EXISTING_HREF`. Change only the text.

## Subject

```
【ORUWA】スタッフアカウントへの招待 / You're invited to ORUWA
```

## Body (HTML)

```html
<h2>ORUWAへようこそ</h2>
<p>店舗のスタッフとしてORUWAに招待されました。</p>
<p>下のボタンからパスワードを設定すると、シフトの確認や勤怠の記録ができるようになります。</p>
<p><a href="KEEP_EXISTING_HREF" style="display:inline-block;padding:12px 20px;background:#4F7A4F;color:#ffffff;text-decoration:none;border-radius:8px;">招待を受けてパスワードを設定する</a></p>
<p style="color:#666;font-size:13px;">このリンクには有効期限があります。期限が切れた場合は、店長に再送信を依頼してください。<br>
お心当たりのない場合は、このメールを破棄してください。</p>
<hr>
<p style="color:#666;font-size:13px;">You have been invited to ORUWA as a staff member of your store.
Use the button above to set your password. The link expires after a while; if it expires, ask your manager to resend it.
If you did not expect this email, you can ignore it.</p>
```

## Check after saving

1. Manager → スタッフ管理 → a test employee with a Founder alias e-mail → 招待する.
2. The email arrives in Japanese, the button opens the password-setup screen
   (not an error page), and after setting a password the Staff screen opens.
3. Delete the test employee (完全に削除).

If step 2 opens an error page, the `href` was changed — restore the old one.
