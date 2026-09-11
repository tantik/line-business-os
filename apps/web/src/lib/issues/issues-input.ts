import {
  parseOptionalIssueCategory,
  parseOptionalIssueSeverity,
  parseOptionalTrimmedString,
  parseTrimmedString,
  parseUuid,
  type IssueCategory,
  type IssueKind,
  type IssueSeverity,
  parseIssueKind,
} from './validation';

/** `FormData` -> typed-input parsers for the Issues & Handover Server Actions, kept out of the `'use server'` module so they stay synchronous and unit-testable, mirroring `@/lib/operations/exceptions-input.ts`'s convention. */

const MAX_NOTE_LENGTH = 1000;
const MAX_RESOLUTION_NOTE_LENGTH = 2000;

export interface CreateIssueInput {
  locationId: string;
  kind: IssueKind;
  note: string;
  category: IssueCategory | null;
  severity: IssueSeverity | null;
}

export function parseCreateIssueInput(formData: FormData): CreateIssueInput | null {
  const locationId = parseUuid(formData.get('locationId'));
  if (locationId === null) return null;
  const kind = parseIssueKind(formData.get('kind'));
  if (kind === null) return null;
  const note = parseTrimmedString(formData.get('note'), MAX_NOTE_LENGTH);
  if (note === null) return null;
  const category = parseOptionalIssueCategory(formData.get('category'));
  if (category === undefined) return null;
  const severity = parseOptionalIssueSeverity(formData.get('severity'));
  if (severity === undefined) return null;
  // Mirrors the 0118 CHECK constraint / RPC validation: severity is only
  // meaningful for kind='issue' -- rejected here too so the form's own error
  // path (not a raw DB error) is what a caller sees on this specific misuse.
  if (kind === 'handover' && severity !== null) return null;
  return { locationId, kind, note, category, severity };
}

export interface AcknowledgeIssueInput {
  issueId: string;
}

export function parseAcknowledgeIssueInput(formData: FormData): AcknowledgeIssueInput | null {
  const issueId = parseUuid(formData.get('issueId'));
  if (issueId === null) return null;
  return { issueId };
}

export interface ResolveIssueInput {
  issueId: string;
  resolutionNote: string | null;
}

export function parseResolveIssueInput(formData: FormData): ResolveIssueInput | null {
  const issueId = parseUuid(formData.get('issueId'));
  if (issueId === null) return null;
  const resolutionNote = parseOptionalTrimmedString(formData.get('resolutionNote'), MAX_RESOLUTION_NOTE_LENGTH);
  if (resolutionNote === undefined) return null;
  return { issueId, resolutionNote };
}
