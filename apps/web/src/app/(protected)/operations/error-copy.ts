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
  operations_schedule_not_found: 'errScheduleNotFound',
  operations_schedule_location_required: 'errScheduleLocationRequired',
  operations_schedule_effective_from_retroactive: 'errScheduleEffectiveFromRetroactive',
  operations_schedule_revision_must_be_future: 'errScheduleRevisionMustBeFuture',
  operations_schedule_revision_before_current_version: 'errScheduleRevisionBeforeCurrentVersion',
  operations_schedule_not_current_version: 'errScheduleNotCurrentVersion',
  operations_template_location_mismatch: 'errTemplateLocationMismatch',
  operations_schedule_already_retired: 'errScheduleAlreadyRetired',
  operations_schedule_not_yet_effective: 'errScheduleNotYetEffective',
  operations_schedule_deactivation_retroactive: 'errScheduleDeactivationRetroactive',
  operations_schedule_version_already_effective: 'errScheduleVersionAlreadyEffective',
  operations_schedule_later_revision_exists: 'errScheduleLaterRevisionExists',
  operations_schedule_version_not_cancellable: 'errScheduleVersionNotCancellable',
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
