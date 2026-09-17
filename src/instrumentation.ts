/** Runs once when a Next.js server instance starts. Node-only work lives in instrumentation-node.ts. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
