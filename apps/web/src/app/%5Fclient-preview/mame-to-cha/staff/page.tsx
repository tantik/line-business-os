import { permanentRedirect } from 'next/navigation';
import { PREVIEW_BASE_PATH } from '@/lib/preview/constants';

/** Backward-compatible canonicalization. Staff now lives at `/mame-to-cha`. */
export default function LegacyMameToChaStaffPage() {
  permanentRedirect(PREVIEW_BASE_PATH);
}
