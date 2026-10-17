export declare function lockedVersions(lock: unknown): { name: string; version: string }[]
export declare function tooYoung(
  versions: { name: string; version: string }[],
  published: Record<string, Record<string, string>>,
  now: number,
  days: number,
): { name: string; version: string }[]
