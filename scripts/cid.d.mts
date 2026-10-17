import type { ImporterOptions } from 'ipfs-unixfs-importer'

/** The IPIP-0499 `unixfs-v1-2025` profile; pinned by scripts/cid.test.ts. */
export declare const IMPORT_OPTIONS: ImporterOptions

export declare function directoryCid(dir: string): Promise<{ cid: string; files: number }>
