"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/ui/button";
import { Container } from "@/ui/container";
import { ErrorState } from "@/ui/states";

export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <Container className="py-20">
      <ErrorState
        title="Something went wrong on our side"
        description="Please try again. If it keeps happening, contact support with the reference below."
        reference={error.digest}
        action={
          <Button onClick={() => retry()}>
            <RotateCcw aria-hidden="true" /> Try again
          </Button>
        }
      />
    </Container>
  );
}
