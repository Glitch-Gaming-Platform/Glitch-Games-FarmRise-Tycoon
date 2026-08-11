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
 * A 409 is returned to the save director, which applies the game's background
 * synchronization policy through the documented resolve endpoint.
 */
import { STORAGE_KEYS } from './config.js';
import type { GlitchClient } from './GlitchClient.js';

/** Glitch rejects anything over 50 MB decoded. */
export const MAX_SAVE_BYTES = 50 * 1024 * 1024;

export interface CloudSaveRecord {
  readonly id: string;
  readonly title_id?: string;
  readonly user_id?: string;
  readonly slot_index: number;
  readonly slot_name?: string | null;
  readonly save_type?: 'manual' | 'auto' | 'checkpoint' | 'quicksave';
  readonly version: number;
  readonly payload: string | null;
  readonly checksum: string;
  readonly size_bytes?: number;
  readonly updated_at: string;
  readonly is_conflicted: boolean;
  readonly metadata?: Record<string, unknown> | null;
  readonly platform?: string | null;
  readonly device_id?: string | null;
  readonly game_version?: string | null;
  readonly client_timestamp?: string | null;
  readonly last_played_at?: string | null;
  readonly play_duration_seconds?: number | null;
  readonly created_at?: string;
  readonly versions?: readonly unknown[];
  readonly active_conflicts?: readonly unknown[];
}

export interface CloudSaveConflict {
  readonly status: 'conflict';
  readonly save_id?: string;
  readonly conflict_id: string;
  readonly server_version: number;
  readonly your_base_version?: number;
  readonly message?: string;
}

export type CloudSaveOutcome =
  | { kind: 'saved'; record: CloudSaveRecord }
  | { kind: 'conflict'; conflict: CloudSaveConflict }
  | { kind: 'unavailable'; reason: string; code: string | null };

export type CloudSaveLoadOutcome =
  | { kind: 'loaded'; record: CloudSaveRecord; rawBytes: Uint8Array }
  | { kind: 'empty' }
  | { kind: 'unavailable'; reason: string; code: string | null };

type CloudSaveRecordResponse = CloudSaveRecord | { readonly data?: CloudSaveRecord };

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

  async list(installId: string, includePayload = false): Promise<CloudSaveRecord[] | null> {
    const result = await this.client.get<{ data?: CloudSaveRecord[] }>(
      `/titles/${this.titleId}/installs/${installId}/saves${includePayload ? '?include_payload=1' : ''}`,
    );
    if (!result.ok) return null;
    const records = result.data?.data ?? [];
    for (const record of records) this.#rememberVersion(record.slot_index, record.version);
    return records;
  }

  /** Loads and verifies one cloud slot before any save document is parsed. */
  async loadSlot(installId: string, slotIndex: number): Promise<CloudSaveLoadOutcome> {
    const result = await this.client.get<{ data?: CloudSaveRecord[] }>(
      `/titles/${this.titleId}/installs/${installId}/saves?include_payload=1`,
    );
    if (!result.ok) {
      return {
        kind: 'unavailable',
        reason: result.error ?? 'Cloud saves could not be loaded.',
        code: result.code,
      };
    }

    const records = result.data?.data ?? [];
    for (const record of records) this.#rememberVersion(record.slot_index, record.version);
    const record = records.find((entry) => entry.slot_index === slotIndex);
    if (!record) return { kind: 'empty' };
    if (!record.payload) {
      return {
        kind: 'unavailable',
        reason: 'The cloud save did not include its payload.',
        code: 'MISSING_PAYLOAD',
      };
    }

    let rawBytes: Uint8Array;
    try {
      rawBytes = base64ToBytes(record.payload);
    } catch {
      return {
        kind: 'unavailable',
        reason: 'The cloud save payload is not valid base64.',
        code: 'INVALID_BASE64',
      };
    }
    const checksum = await sha256Hex(rawBytes);
    if (checksum !== record.checksum.toLowerCase()) {
      return {
        kind: 'unavailable',
        reason: 'The cloud save failed its checksum verification.',
        code: 'CHECKSUM_MISMATCH',
      };
    }
    return { kind: 'loaded', record, rawBytes };
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

    const result = await this.client.post<CloudSaveRecordResponse | CloudSaveConflict>(
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

    const record = cloudSaveRecord(result.data as CloudSaveRecordResponse);
    if (!record) {
      return {
        kind: 'unavailable',
        reason: 'Glitch accepted the save but returned no save record.',
        code: 'MISSING_SAVE_RECORD',
      };
    }
    this.#rememberVersion(slotIndex, record.version);
    return { kind: 'saved', record };
  }

  /**
   * Resolves a conflict with the policy selected by the save director.
   * `keep_server` discards the local write; `use_client` commits it.
   */
  async resolve(
    installId: string,
    saveId: string,
    conflictId: string,
    choice: 'keep_server' | 'use_client',
    slotIndex: number,
  ): Promise<CloudSaveRecord | null> {
    const result = await this.client.post<CloudSaveRecordResponse>(
      `/titles/${this.titleId}/installs/${installId}/saves/${saveId}/resolve`,
      { conflict_id: conflictId, choice },
    );
    if (!result.ok || !result.data) return null;
    const record = cloudSaveRecord(result.data);
    if (!record) return null;
    // The returned version becomes the new base for the next write.
    this.#rememberVersion(slotIndex, record.version);
    return record;
  }

  /** Resolves captures where Glitch omitted save_id from the 409 body. */
  async resolveConflict(
    installId: string,
    conflict: CloudSaveConflict,
    choice: 'keep_server' | 'use_client',
    slotIndex: number,
  ): Promise<CloudSaveRecord | null> {
    let saveId = conflict.save_id;
    if (!saveId) {
      const records = await this.list(installId);
      saveId = records?.find((record) => record.slot_index === slotIndex)?.id;
    }
    if (!saveId) return null;
    return this.resolve(installId, saveId, conflict.conflict_id, choice, slotIndex);
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

/** Save writes and resolves are wrapped as `{ data: record }` by the live API. */
function cloudSaveRecord(response: CloudSaveRecordResponse): CloudSaveRecord | null {
  if ('slot_index' in response && typeof response.version === 'number') return response;
  const record = 'data' in response ? response.data : undefined;
  return record && typeof record.version === 'number' ? record : null;
}
