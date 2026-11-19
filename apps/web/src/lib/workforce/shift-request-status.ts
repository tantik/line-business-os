/**
 * DEBT-139 L3 (0156): moving an employee to another store sets their pending
 * shift requests -- and their approved preferences for today or later -- at
 * the old store to `status = 'cancelled'`, and the one-preference-per-day
 * index ignores cancelled rows, so a cancelled row and a live row can exist
 * for the same employee + day. A cancelled request is not "submitted": every
 * reader of shift preferences / requests skips it. Pure; safe on the client.
 */
export function isLiveShiftRequest(request: { status?: string }): boolean {
  return request.status !== 'cancelled';
}
