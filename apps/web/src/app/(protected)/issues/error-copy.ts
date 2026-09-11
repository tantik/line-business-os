import type { Lang } from '@/lib/demo/cafe/i18n';
import type { IssuesWriteResult } from '@/lib/issues/result-types';
import { tIssues, type IssuesDictKey } from './issues-i18n';

/** Every `api.issues_*` (0118) exception message this slice's forms can realistically trigger, mapped to its own bilingual copy key. A code not in this map still renders `errorGeneric`, never the raw machine identifier. */
const KNOWN_ISSUES_ERROR_KEYS: Record<string, IssuesDictKey> = {
  issues_no_auth_context: 'errNoAuthContext',
  issues_module_disabled: 'errModuleDisabled',
  issues_invalid_kind: 'errInvalidKind',
  issues_invalid_category: 'errInvalidCategory',
  issues_invalid_severity: 'errInvalidSeverity',
  issues_severity_not_applicable_to_handover: 'errSeverityNotApplicableToHandover',
  issues_invalid_note: 'errInvalidNote',
  issues_permission_denied: 'errPermissionDenied',
  issues_not_found: 'errNotFound',
  issues_not_open: 'errNotOpen',
  issues_already_resolved: 'errAlreadyResolved',
};

/** Shared client-side error copy for every write call in this module. Bilingual (JA/EN) -- never a raw machine error code or an untranslated string reaches the UI. Mirrors `@/app/(protected)/operations/error-copy.ts`'s `describeOperationsWriteError`. */
export function describeIssuesWriteError(result: Exclude<IssuesWriteResult<unknown>, { status: 'success' }>, lang: Lang): string {
  const t = (key: IssuesDictKey) => tIssues(lang, key);
  switch (result.status) {
    case 'not_authenticated':
      return t('errorNotAuthenticated');
    case 'no_membership':
      return t('errorNoMembership');
    case 'issues_error':
      return t(KNOWN_ISSUES_ERROR_KEYS[result.code] ?? 'errorGeneric');
    case 'unauthorized':
    case 'config_error':
    case 'unexpected_error':
      return result.message || t('errorGeneric');
    default:
      return t('errorGeneric');
  }
}
