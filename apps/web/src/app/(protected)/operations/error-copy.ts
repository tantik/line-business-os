import type { Lang } from '@/lib/demo/cafe/i18n';
import type { OperationsWriteResult } from '@/lib/operations/result-types';
import { tOperations, type OperationsDictKey } from './operations-i18n';

/** Every `api.operations_*` (0105) exception message this slice's forms can realistically trigger, mapped to its own bilingual copy key. A code not in this map (e.g. a future RPC exception) still renders `errorGeneric`, never the raw machine identifier. */
const KNOWN_OPERATIONS_ERROR_KEYS: Record<string, OperationsDictKey> = {
  operations_no_auth_context: 'errNoAuthContext',
  operations_module_disabled: 'errModuleDisabled',
  operations_template_name_required: 'errNameRequired',
  operations_permission_denied: 'errPermissionDenied',
  operations_location_not_found: 'errLocationNotFound',
  operations_template_not_found: 'errTemplateNotFound',
  operations_template_already_retired: 'errTemplateAlreadyRetired',
  operations_template_retire_retroactive: 'errTemplateRetireRetroactive',
  operations_template_retired: 'errTemplateRetired',
  operations_item_label_required: 'errItemLabelRequired',
  operations_item_not_found: 'errItemNotFound',
  operations_item_definition_frozen_after_operational: 'errItemDefinitionFrozen',
};

/** Shared client-side error copy for every write call on this page. Bilingual (JA/EN) -- never a raw machine error code or an untranslated string reaches the UI. */
export function describeOperationsWriteError(result: Exclude<OperationsWriteResult<unknown>, { status: 'success' }>, lang: Lang): string {
  const t = (key: OperationsDictKey) => tOperations(lang, key);
  switch (result.status) {
    case 'not_authenticated':
      return t('errorNotAuthenticated');
    case 'no_membership':
      return t('errorNoMembership');
    case 'operations_error':
      return t(KNOWN_OPERATIONS_ERROR_KEYS[result.code] ?? 'errorGeneric');
    case 'unauthorized':
    case 'config_error':
    case 'unexpected_error':
      return result.message || t('errorGeneric');
    default:
      return t('errorGeneric');
  }
}
