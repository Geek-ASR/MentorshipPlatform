import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type RequestContext = {
  requestId: string;
  route?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

/** Accepts a well-formed incoming request id (for tracing through proxies), otherwise generates one. */
export function resolveRequestId(incoming: string | null | undefined): string {
  return incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
}

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
