import { brand } from "@/config/brand";
import { SiteFooter, SiteHeader, SkipLink } from "@/ui/site-chrome";

/** docs/22 §10.3: `Organization` and `WebSite` (with a `SearchAction`) apply to every public page,
 * so they're emitted once here rather than duplicated in every page component. */
function OrganizationJsonLd() {
  const appBaseUrl = process.env.APP_BASE_URL ?? "";
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: brand.name,
        url: appBaseUrl,
        description: brand.description,
      },
      {
        "@type": "WebSite",
        name: brand.name,
        url: appBaseUrl,
        potentialAction: {
          "@type": "SearchAction",
          target: `${appBaseUrl}/mentors?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
  );
}

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <OrganizationJsonLd />
      <SkipLink />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
