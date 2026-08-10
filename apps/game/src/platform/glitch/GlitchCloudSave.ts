/**
 * Glitch Cloud Save.
 *
 * Two details in the Glitch contract cause almost every integration bug, and
 * both are handled explicitly here:
 *
 *   1. `checksum` is the SHA-256 of the DECODED bytes, not of the base64
 *      string. Hashing the base64 is the documented cause of
 *      CHECKSUM_MISMATCH.
 *   2. `base_version` drives optimistic concurrency. Sending 0 forever means
 *      every save after the first conflicts. We persist the server version per
 *      slot and send it back.
 *
 * On 409 we never silently overwrite. The conflict is surfaced and resolved
 * through the documented resolve endpoint with an explicit choice.
 */
import { STORAGE_KEYS } from './config.js';
import type { GlitchClient } from './GlitchClient.js';

/** Glitch rejects anything over 50 MB decoded. */
export const MAX_SAVE_BYTES = 50 * 1024 * 1024;

export interface CloudSaveRecord {
  readonly id: string;
  readonly slot_index: number;
  readonly version: number;
  readonly payload: string | null;
  readonly checksum: string;
  readonly updated_at: string;
  readonly is_conflicted: boolean;
}

export interface CloudSaveConflict {
  readonly status: 'conflict';
  readonly save_id: string;
  readonly conflict_id: string;
  readonly server_version: number;
  readonly your_base_version: number;
}

export type CloudSaveOutcome =
  | { kind: 'saved'; record: CloudSaveRecord }
  | { kind: 'conflict'; conflict: CloudSaveConflict }
  | { kind: 'unavailable'; reason: string; code: string | null };

/** Base64 of raw bytes. Chunked so a large save cannot blow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Lowercase hex SHA-256 of the RAW bytes.
 *
 * Note the argument type: this function cannot be handed a base64 string by
 * accident, which is the whole point.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Copy into a fresh ArrayBuffer. A Uint8Array may be backed by a
  // SharedArrayBuffer, which SubtleCrypto refuses, and it may also be a view
  // into a larger buffer - hashing that would hash the wrong bytes.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class GlitchCloudSave {
  readonly #versions = new Map<number, number>();

  constructor(
    private readonly client: GlitchClient,
    private readonly titleId: string,
  ) {
    this.#restoreVersions();
  }

  /** Last server version we know for a slot. Drives conflict detection. */
  knownVersion(slotIndex: number): number {
    return this.#versions.get(slotIndex) ?? 0;
  }

  async list(installId: string): Promise<CloudSaveRecord[] | null> {
    const result = await this.client.get<{ data?: CloudSaveRecord[] }>(
      `/titles/${this.titleId}/installs/${installId}/saves`,
    );
    if (!result.ok) return null;
    const records = result.data?.data ?? [];
    for (const record of records) this.#rememberVersion(record.slot_index, record.version);
    return records;
  }

  async store(
    installId: string,
    slotIndex: number,
    rawBytes: Uint8Array,
    options: {
      saveType?: 'manual' | 'auto' | 'checkpoint' | 'quicksave';
      slotName?: string;
      metadata?: Record<string, unknown>;
      gameVersion?: string;
    } = {},
  ): Promise<CloudSaveOutcome> {
    if (rawBytes.byteLength > MAX_SAVE_BYTES) {
      return {
        kind: 'unavailable',
        reason: 'Save is larger than 50 MB.',
        code: 'PAYLOAD_TOO_LARGE',
      };
    }

    const payload = bytesToBase64(rawBytes);
    const checksum = await sha256Hex(rawBytes);

    const result = await this.client.post<CloudSaveRecord | CloudSaveConflict>(
      `/titles/${this.titleId}/installs/${installId}/saves`,
      {
        slot_index: slotIndex,
        payload,
        checksum,
        save_type: options.saveType ?? 'auto',
        client_timestamp: new Date().toISOString(),
        base_version: this.knownVersion(slotIndex),
        ...(options.slotName ? { slot_name: options.slotName } : {}),
        ...(options.metadata ? { metadata: options.metadata } : {}),
        ...(options.gameVersion ? { game_version: options.gameVersion } : {}),
        platform: 'web',
      },
    );

    if (result.status === 409) {
      const conflict = result.data as CloudSaveConflict | null;
      if (conflict?.conflict_id) return { kind: 'conflict', conflict };
      return { kind: 'unavailable', reason: 'Save conflict without details.', code: 'CONFLICT' };
    }

    if (!result.ok || !result.data) {
      return {
        kind: 'unavailable',
        reason: result.error ?? 'Cloud save failed.',
        code: result.code,
      };
    }

    const record = result.data as CloudSaveRecord;
    this.#rememberVersion(slotIndex, record.version);
    return { kind: 'saved', record };
  }

  /**
   * Resolves a conflict with an explicit choice.
   *
   * `keep_server` discards the local run; `use_client` overwrites the cloud.
   * The caller must have asked the player - this method does not decide.
   */
  async resolve(
    installId: string,
    saveId: string,
    conflictId: string,
    choice: 'keep_server' | 'use_client',
    slotIndex: number,
  ): Promise<CloudSaveRecord | null> {
    const result = await this.client.post<CloudSaveRecord>(
      `/titles/${this.titleId}/installs/${installId}/saves/${saveId}/resolve`,
      { conflict_id: conflictId, choice },
    );
    if (!result.ok || !result.data) return null;
    // The returned version becomes the new base for the next write.
    this.#rememberVersion(slotIndex, result.data.version);
    return result.data;
  }

  #rememberVersion(slotIndex: number, version: number): void {
    this.#versions.set(slotIndex, version);
    try {
      globalThis.localStorage?.setItem(
        STORAGE_KEYS.saveVersions,
        JSON.stringify([...this.#versions.entries()]),
      );
    } catch {
      /* ephemeral */
    }
  }

  #restoreVersions(): void {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEYS.saveVersions);
      if (!raw) return;
      for (const [slot, version] of JSON.parse(raw) as [number, number][]) {
        this.#versions.set(slot, version);
      }
    } catch {
      /* start from zero */
    }
  }
}
