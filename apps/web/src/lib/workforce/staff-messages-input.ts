import { parseTrimmedString, parseUuid } from './validation';

/** Matches `workforce.staff_messages.body`'s own `check (length(body) between 1 and 500)` constraint (0090). */
const MESSAGE_BODY_MAX_LENGTH = 500;

// ============================================================================
// submitStaffMessage / submitManagerMessage (FormData)
// ============================================================================

export interface SubmitStaffMessageFormInput {
  body: string;
}

export function parseSubmitStaffMessageInput(formData: FormData): SubmitStaffMessageFormInput | null {
  const body = parseTrimmedString(formData.get('body'), MESSAGE_BODY_MAX_LENGTH);
  if (!body) return null;
  return { body };
}

export interface SubmitManagerMessageFormInput {
  employeeId: string;
  body: string;
}

export function parseSubmitManagerMessageInput(formData: FormData): SubmitManagerMessageFormInput | null {
  const employeeId = parseUuid(formData.get('employeeId'));
  if (!employeeId) return null;
  const body = parseTrimmedString(formData.get('body'), MESSAGE_BODY_MAX_LENGTH);
  if (!body) return null;
  return { employeeId, body };
}

// ============================================================================
// markStaffMessageReadAction / archiveStaffMessageAction (FormData)
// ============================================================================

export interface StaffMessageIdFormInput {
  messageId: string;
}

export function parseStaffMessageIdInput(formData: FormData): StaffMessageIdFormInput | null {
  const messageId = parseUuid(formData.get('messageId'));
  if (!messageId) return null;
  return { messageId };
}
