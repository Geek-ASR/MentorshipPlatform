"use client";

/** Replaces the root layout when it fails; must render its own document and cannot rely on global CSS. */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          padding: "4rem 1rem",
          textAlign: "center",
        }}
      >
        <title>Something went wrong</title>
        <h1 style={{ fontSize: "1.5rem" }}>Something went wrong</h1>
        <p>Please try again in a moment.</p>
        {error.digest ? (
          <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Reference: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={() => retry()}
          style={{ marginTop: "1rem", padding: "0.6rem 1.2rem" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
