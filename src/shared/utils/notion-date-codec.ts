export function epochMsToNotionDate(value: unknown): { start: string } | null {
  if (value === undefined || value === null || value === "") return null;
  const ms = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return { start: new Date(ms).toISOString() };
}

export function notionDateToEpochMs(value: unknown): number | undefined {
  const start =
    typeof value === "string"
      ? value
      : (value as { start?: string } | null | undefined)?.start;

  if (!start) return undefined;
  const ms = Date.parse(start);
  return Number.isFinite(ms) ? ms : undefined;
}

export function normalizeNotionDateFilterValue(value: unknown): string {
  const date = epochMsToNotionDate(value);
  if (!date?.start) {
    throw new Error(`Invalid date filter value: ${String(value)}`);
  }
  return date.start;
}
