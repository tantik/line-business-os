/**
 * Pure text for the shift-preference reminder email -- no server imports, so
 * the Manager popup can show the exact text the server will send
 * (`shift-preference-reminder.ts`) as a preview before the Manager confirms.
 */

/** `YYYY-MM` of the calendar month after `todayIso` (`YYYY-MM-DD`). */
export function nextMonthPrefix(todayIso: string): string {
  const year = Number(todayIso.slice(0, 4));
  const month = Number(todayIso.slice(5, 7));
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Bilingual (JA first, EN second) because the platform has no server-side
 * per-employee language yet (DEBT-017), so the email cannot know which
 * language the recipient reads the app in. Content: display name and target
 * month only -- no internal ids, no tenant or schedule data.
 */
export function buildShiftPreferenceReminderEmail(staffName: string, monthPrefix: string): { subject: string; text: string } {
  const year = Number(monthPrefix.slice(0, 4));
  const month = Number(monthPrefix.slice(5, 7));
  const ja = `${year}年${month}月`;
  const en = `${EN_MONTHS[month - 1] ?? ''} ${year}`;
  return {
    subject: `【ORUWA】${ja}のシフト希望の提出のお願い / Shift preferences for ${en}`,
    text: [
      `${staffName}さん`,
      '',
      `${ja}のシフト希望がまだ提出されていません。`,
      'ORUWAのスタッフ画面「来月のシフト希望を提出」から、お手すきの際にご提出をお願いします。',
      '',
      '※このメールは店長の操作により送信されました。このアドレスへの返信は確認されません。',
      '',
      '----',
      '',
      `Hi ${staffName},`,
      '',
      `Your shift preferences for ${en} have not been submitted yet.`,
      'Please submit them from "Submit next month\'s shift preference" on your ORUWA staff screen when you have a moment.',
      '',
      'This email was sent by your manager. Replies to this address are not monitored.',
    ].join('\n'),
  };
}
