import { parseOptionalTrimmedString, parseUuid } from './validation';

/** `FormData` -> typed-input parser for the Manager Attention slice's one Server Action, kept out of the `'use server'` module so it stays synchronous and unit-testable, mirroring `templates-input.ts`'s convention. */

export interface ResolveExceptionInput {
  exceptionId: string;
  resolutionNote: string | null;
}

export function parseResolveExceptionInput(formData: FormData): ResolveExceptionInput | null {
  const exceptionId = parseUuid(formData.get('exceptionId'));
  if (exceptionId === null) return null;
  const resolutionNote = parseOptionalTrimmedString(formData.get('resolutionNote'), 2000);
  if (resolutionNote === undefined) return null;
  return { exceptionId, resolutionNote };
}
