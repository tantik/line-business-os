/**
 * ORUWA support contact shown to Owners whose invitation cannot be used
 * (DEBT-113a). One constant so the move to a domain mailbox
 * (`support@oruwa.jp`, before production) is a one-line change.
 */
export const SUPPORT_EMAIL = 'oruwa.jp@gmail.com';

export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;
