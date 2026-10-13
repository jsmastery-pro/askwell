// Same shape check as getOwnedProject in packages/db: a malformed ID would make Postgres
// throw on the uuid cast (a 500), so callers treat it as "not found" instead.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string) => UUID_RE.test(value);
