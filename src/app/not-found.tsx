import { SearchX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/ui/button";
import { Container } from "@/ui/container";
import { EmptyState } from "@/ui/states";

export default function NotFound() {
  return (
    <Container className="py-20">
      <EmptyState
        icon={<SearchX className="size-8" aria-hidden="true" />}
        title="We couldn't find that page"
        description="The link may be outdated, or the page may have moved."
        action={
          <Button asChild>
            <Link href="/">Go to the home page</Link>
          </Button>
        }
      />
    </Container>
  );
}
