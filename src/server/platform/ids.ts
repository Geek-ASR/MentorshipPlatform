import { v7 as uuidv7, validate, version } from "uuid";

/** Time-ordered UUIDv7 for primary keys (index locality, no enumeration of sequential ids). */
export function newId(): string {
  return uuidv7();
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && validate(value);
}

export function isUuidV7(value: unknown): value is string {
  return isUuid(value) && version(value) === 7;
}
