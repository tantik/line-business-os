import { redirect } from 'next/navigation';

/**
 * The start page has no content of its own: `/sign-in` sends a signed-out
 * visitor to the ORUWA sign-in form and a signed-in one straight to their
 * role's workspace. (It used to be a "LINE Business OS" developer index
 * linking to a non-existent /workforce page.)
 */
export const dynamic = 'force-dynamic';

export default function HomePage() {
  redirect('/sign-in');
}
