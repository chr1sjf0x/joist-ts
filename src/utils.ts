export function getOrSet<T extends Record<keyof unknown, unknown>>(
  record: T,
  key: keyof T,
  defaultValue: T[keyof T],
): T[keyof T] {
  if (record[key] === undefined) {
    record[key] = defaultValue;
  }
  return record[key];
}