import { SearchX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/ui/button";
import { Container } from "@/ui/container";
import { SiteFooter, SiteHeader, SkipLink } from "@/ui/site-chrome";
import { EmptyState } from "@/ui/states";

/** Rendered under the root layout only, so it brings the public chrome with it — a lost visitor
 * still has the navigation to find their way. */
export default function NotFound() {
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Container className="py-20">
          <EmptyState
            icon={<SearchX className="size-8" aria-hidden="true" />}
            title="We couldn't find that page"
            description="The link may be outdated, or the page may have moved."
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Button asChild>
                  <Link href="/">Go to the home page</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/mentors">Explore mentors</Link>
                </Button>
              </div>
            }
          />
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
