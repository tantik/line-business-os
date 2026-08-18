import type { MetadataRoute } from 'next';

/**
 * Cafe v2.1 hardening, P3: the authenticated app (Manager/Staff/Recipes/
 * Inventory, sign-in, and the legacy `/dashboard` shell) has no reason to be
 * crawled or indexed -- it's tenant-scoped operational tooling behind auth,
 * not public content. Each of those routes also carries its own
 * `robots: { index: false }` in its page metadata (belt-and-suspenders: this
 * file stops crawling, the meta tag stops indexing anything a crawler
 * reaches anyway, e.g. via a stray external link). Public marketing/demo
 * surfaces (`/`, `/booking`, `/demo/cafe/**`, `/mame-to-cha/**`) are left
 * crawlable -- disallowing them is a product/marketing decision, not an
 * engineering default, and out of this mission's scope.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: ['/manager', '/staff', '/recipes', '/inventory', '/sign-in', '/dashboard', '/auth'],
    },
  };
}
