import { makeTranslator, type Lang } from '@/lib/demo/cafe/i18n';

/**
 * JA/EN copy for the signed-out account screens (sign-in, forgot password,
 * reset password, invitation password setup, invalid link) and the app-wide
 * not-found / error / access states. JA is the default; staff are Japanese.
 * Fixed strings only -- never echo a Supabase/DB error message to the user.
 */
const authCopy = {
  ja: {
    brandTagline: '店舗運営をひとつに',
    langLabel: '表示言語',

    signInTitle: 'ログイン',
    signInLead: 'メールアドレスとパスワードでログインしてください。',
    email: 'メールアドレス',
    password: 'パスワード',
    signInButton: 'ログイン',
    signingIn: 'ログイン中…',
    signInError: 'メールアドレスまたはパスワードが正しくありません。',
    forgotLink: 'パスワードをお忘れですか？',
    noAccountHint: 'アカウントは店長からの招待メールで作成されます。',

    forgotTitle: 'パスワードの再設定',
    forgotLead: '登録しているメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。',
    forgotButton: '再設定メールを送信',
    forgotSending: '送信中…',
    forgotSentTitle: 'メールを確認してください',
    forgotSentBody:
      'このメールアドレスが登録されている場合、パスワード再設定用のリンクを送信しました。数分たっても届かない場合は、迷惑メールフォルダもご確認ください。',
    forgotInvalidEmail: '正しいメールアドレスを入力してください。',
    forgotRetryLater: '送信できませんでした。しばらくしてからもう一度お試しください。',
    backToSignIn: 'ログイン画面に戻る',

    resetTitle: '新しいパスワードの設定',
    resetLead: '新しいパスワードを入力してください。',
    newPassword: '新しいパスワード',
    confirmPassword: 'パスワード（確認）',
    passwordHint: '8文字以上で入力してください。',
    resetButton: 'パスワードを変更する',
    resetSaving: '変更中…',
    passwordTooShort: 'パスワードは8文字以上で入力してください。',
    passwordMismatch: 'パスワードが一致しません。',
    passwordSameAsOld: '以前と同じパスワードは使用できません。別のパスワードを入力してください。',
    passwordWeak: 'このパスワードは使用できません。別のパスワードを入力してください。',
    genericError: 'エラーが発生しました。もう一度お試しください。',

    inviteTitle: 'ようこそ ORUWA へ',
    inviteLead: 'スタッフとしてログインするための、パスワードを設定してください。',
    inviteButton: 'パスワードを設定してはじめる',
    inviteSaving: '設定中…',
    inviteNotFound: 'この招待は無効か、すでに使用されています。店長に再送を依頼してください。',
    inviteUnauthorized: 'この招待を受け入れる権限がありません。招待の有効期限が切れている可能性があります。',

    linkInvalidTitle: 'リンクが無効です',
    linkInvalidBody:
      'このリンクは有効期限が切れているか、すでに使用されています。招待メールの場合は店長に再送を依頼してください。パスワード再設定の場合は、もう一度再設定メールを送信してください。',
    requestNewLink: '再設定メールを送り直す',

    notFoundTitle: 'ページが見つかりません',
    notFoundBody: 'お探しのページは存在しないか、移動した可能性があります。',
    goHome: 'トップに戻る',
    errorTitle: 'エラーが発生しました',
    errorBody: '予期しないエラーが発生しました。もう一度お試しください。',
    retry: '再試行',
    loadingTitle: '読み込み中…',
    loadingBody: '画面を準備しています。',
    accessDeniedTitle: 'アクセスできません',
    accessDeniedBody: 'このページを表示する権限がありません。',
    noTenantTitle: '所属している店舗がありません',
    noTenantBody: 'このアカウントはまだどの店舗にも登録されていません。店長に招待を依頼してください。',
    configTitle: '設定が必要です',
    itemNotFoundTitle: '見つかりません',
    itemNotFoundBody: 'お探しの項目は存在しないか、表示する権限がありません。',
    moduleUnavailableTitle: 'この機能は利用できません',
    moduleUnavailableBody: 'この機能は現在の店舗では有効になっていません。管理者に有効化を依頼してください。',
  },
  en: {
    brandTagline: 'Your store, in one place',
    langLabel: 'Language',

    signInTitle: 'Sign in',
    signInLead: 'Sign in with your email address and password.',
    email: 'Email',
    password: 'Password',
    signInButton: 'Sign in',
    signingIn: 'Signing in…',
    signInError: 'The email address or password is incorrect.',
    forgotLink: 'Forgot your password?',
    noAccountHint: 'Accounts are created from your manager’s invitation email.',

    forgotTitle: 'Reset your password',
    forgotLead: 'Enter the email address you use for ORUWA. We will send you a link to set a new password.',
    forgotButton: 'Send reset email',
    forgotSending: 'Sending…',
    forgotSentTitle: 'Check your email',
    forgotSentBody:
      'If this email address is registered, we have sent a password reset link. If it does not arrive within a few minutes, check your spam folder.',
    forgotInvalidEmail: 'Enter a valid email address.',
    forgotRetryLater: 'We could not send the email. Please try again in a little while.',
    backToSignIn: 'Back to sign in',

    resetTitle: 'Set a new password',
    resetLead: 'Enter your new password.',
    newPassword: 'New password',
    confirmPassword: 'Confirm password',
    passwordHint: 'Use at least 8 characters.',
    resetButton: 'Change password',
    resetSaving: 'Saving…',
    passwordTooShort: 'Use at least 8 characters for your password.',
    passwordMismatch: 'The passwords do not match.',
    passwordSameAsOld: 'You cannot reuse your previous password. Choose a different one.',
    passwordWeak: 'This password cannot be used. Choose a different one.',
    genericError: 'Something went wrong. Please try again.',

    inviteTitle: 'Welcome to ORUWA',
    inviteLead: 'Set the password you will use to sign in as staff.',
    inviteButton: 'Set password and start',
    inviteSaving: 'Saving…',
    inviteNotFound: 'This invitation is invalid or has already been used. Ask your manager to resend it.',
    inviteUnauthorized: 'You cannot accept this invitation. It may have expired.',

    linkInvalidTitle: 'This link is not valid',
    linkInvalidBody:
      'The link has expired or has already been used. For an invitation, ask your manager to resend it. For a password reset, request a new reset email.',
    requestNewLink: 'Request a new reset email',

    notFoundTitle: 'Page not found',
    notFoundBody: 'The page you are looking for does not exist or has moved.',
    goHome: 'Go to the start page',
    errorTitle: 'Something went wrong',
    errorBody: 'An unexpected error occurred. Please try again.',
    retry: 'Try again',
    loadingTitle: 'Loading…',
    loadingBody: 'Preparing your workspace.',
    accessDeniedTitle: 'Access denied',
    accessDeniedBody: 'You do not have permission to view this page.',
    noTenantTitle: 'No store yet',
    noTenantBody: 'Your account is not registered to any store yet. Ask your manager for an invitation.',
    configTitle: 'Configuration required',
    itemNotFoundTitle: 'Not found',
    itemNotFoundBody: 'The item you are looking for does not exist or is not available to you.',
    moduleUnavailableTitle: 'Feature unavailable',
    moduleUnavailableBody: 'This feature is not enabled for your store. Ask an administrator to enable it.',
  },
};

export type AuthCopyKey = keyof (typeof authCopy)['ja'];

export const tAuth: (lang: Lang, key: AuthCopyKey) => string = makeTranslator(authCopy);
