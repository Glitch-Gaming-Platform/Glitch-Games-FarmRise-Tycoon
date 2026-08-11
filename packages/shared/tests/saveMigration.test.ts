/**
 * Migration tests run against a fixture captured from the *shipped* version 1
 * format, not a hand-written approximation of it. A migration tested only
 * against an idealised input is not tested: the whole risk is that the real
 * documents on real players' machines differ from what we remember writing.
 */
import { describe, expect, it } from 'vitest';
import {
  CAREER_SCHEMA_VERSION,
  HOMESTEAD_PARCEL_ID,
  NORTH_FIELD_PARCEL_ID,
  STARTER_EXTENSION_PARCEL_ID,
  V1_SECOND_PARCEL_ID,
  V1_TILE_OFFSET,
  careerSaveStateSchema,
  migrateSave,
  newCareer,
  type LegacySaveStateV1,
} from '../src/index.js';

/** A version 1 save as the first playable actually wrote it. */
const V1_FIXTURE: LegacySaveStateV1 = {
  schemaVersion: 1,
  tick: 42_000,
  balance: 18_450,
  plots: [
    {
      id: 'plot-1',
      cropId: 'pumpkin',
      grownTicks: 9_000,
      tendCount: 2,
      water: 0.62,
      irrigated: true,
      diseased: false,
      eventMultiplier: 1,
    },
    {
      id: 'plot-4',
      cropId: null,
      grownTicks: 0,
      tendCount: 0,
      water: 1,
      irrigated: false,
      diseased: false,
      eventMultiplier: 1,
    },
  ],
  buildings: [
    { kind: 'barn', tileX: 3, tileZ: 11, remainingBuildTicks: 0 },
    { kind: 'road', tileX: 7, tileZ: 8, remainingBuildTicks: 120 },
  ],
  animals: [{ species: 'chicken', count: 5, cycleTicks: 900 }],
  inventory: { wheat: 12, eggs: 4 },
  landParcels: 1,
  rngState: 123_456,
} as LegacySaveStateV1;

const migrate = (overrides: Partial<LegacySaveStateV1> = {}) =>
  migrateSave({ ...V1_FIXTURE, ...overrides }, 'career-under-test');

describe('migrateSave, version 1 to 2', () => {
  it('produces a document that satisfies the current schema', () => {
    const result = migrate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.schemaVersion).toBe(CAREER_SCHEMA_VERSION);
    expect(careerSaveStateSchema.safeParse(result.value.state).success).toBe(true);
  });

  it('keeps the money, the clock and the seed the player actually had', () => {
    const result = migrate();
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.state.balance).toBe(V1_FIXTURE.balance);
    expect(result.value.state.tick).toBe(V1_FIXTURE.tick);
    expect(result.value.state.seed).toBe(V1_FIXTURE.rngState);
    expect(result.value.fromVersion).toBe(1);
  });

  it('offsets tile coordinates onto the estate grid', () => {
    const result = migrate();
    if (!result.ok) throw new Error(result.reason);
    const barn = result.value.state.sites[0]?.buildings.find(
      (building) => building.kind === 'barn',
    );
    expect(barn?.tileX).toBe(3 + V1_TILE_OFFSET);
    expect(barn?.tileZ).toBe(11 + V1_TILE_OFFSET);
  });

  it('gives every migrated building a stable id', () => {
    const result = migrate();
    if (!result.ok) throw new Error(result.reason);
    const ids = result.value.state.sites[0]?.buildings.map((building) => building.id) ?? [];
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('preserves construction still in progress', () => {
    const result = migrate();
    if (!result.ok) throw new Error(result.reason);
    const road = result.value.state.sites[0]?.buildings.find(
      (building) => building.kind === 'road',
    );
    expect(road?.remainingBuildTicks).toBe(120);
  });

  it('lands the old global inventory in the yard store', () => {
    const result = migrate();
    if (!result.ok) throw new Error(result.reason);
    const site = result.value.state.sites[0];
    const held = site?.stores.reduce((sum, store) => sum + (store.items['wheat'] ?? 0), 0);
    expect(held).toBe(12);
  });

  it('keeps the animals the player was looking after', () => {
    const result = migrate();
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.state.sites[0]?.animals[0]?.count).toBe(5);
    expect(result.value.state.sites[0]?.animals[0]?.cycleTicks).toBe(900);
  });

  it('owns only the homestead when v1 recorded one parcel', () => {
    const result = migrate({ landParcels: 1 });
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.state.sites[0]?.ownedParcelIds).toEqual([HOMESTEAD_PARCEL_ID]);
  });

  it('resolves a second v1 parcel to the only parcel that build could sell', () => {
    const result = migrate({ landParcels: 2 });
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.state.sites[0]?.ownedParcelIds).toContain(V1_SECOND_PARCEL_ID);
    expect(result.value.state.sites[0]?.ownedParcelIds).toContain(STARTER_EXTENSION_PARCEL_ID);
    expect(result.value.notes.some((note) => note.field.includes('ownedParcelIds'))).toBe(true);
  });

  it('explains every value it had to choose', () => {
    const result = migrate();
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.notes.length).toBeGreaterThan(0);
    for (const note of result.value.notes) {
      expect(note.reason.length).toBeGreaterThan(20);
    }
  });

  it('starts every buyer relationship at zero, because v1 had no trust model', () => {
    const result = migrate();
    if (!result.ok) throw new Error(result.reason);
    for (const relationship of Object.values(result.value.state.buyers)) {
      expect(relationship.trust).toBe(0);
      expect(relationship.deliveries).toBe(0);
    }
  });
});

describe('migrateSave, other inputs', () => {
  it('passes a current document through untouched', () => {
    const current = newCareer({ careerId: 'career-current', seed: 7 });
    const result = migrateSave(current, 'career-current');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fromVersion).toBe(CAREER_SCHEMA_VERSION);
    expect(result.value.notes).toHaveLength(0);
    expect(result.value.state).toEqual(current);
  });

  it('keeps the connecting strip and new beds for an old North Field owner', () => {
    const current = newCareer({ careerId: 'career-current', seed: 7 });
    const site = current.sites[0]!;
    const oldLayout = {
      ...current,
      sites: [
        {
          ...site,
          ownedParcelIds: [...site.ownedParcelIds, NORTH_FIELD_PARCEL_ID],
        },
      ],
    };

    const result = migrateSave(oldLayout, current.careerId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const migrated = result.value.state.sites[0]!;
    expect(migrated.ownedParcelIds).toContain(STARTER_EXTENSION_PARCEL_ID);
    expect(migrated.ownedParcelIds).toContain(NORTH_FIELD_PARCEL_ID);
    expect(migrated.plots.map((plot) => String(plot.id))).toEqual(
      expect.arrayContaining(['plot-n5', 'plot-n6', 'plot-n7', 'plot-n9', 'plot-n10', 'plot-n11']),
    );
    expect(result.value.notes.some((note) => /Starter Extension/.test(note.reason))).toBe(true);
  });

  it('refuses a document that is not a save at all', () => {
    expect(migrateSave({ hello: 'world' }, 'career').ok).toBe(false);
    expect(migrateSave(null, 'career').ok).toBe(false);
    expect(migrateSave('save', 'career').ok).toBe(false);
  });

  it('refuses a damaged version 1 document rather than guessing', () => {
    const result = migrateSave({ ...V1_FIXTURE, balance: -5 }, 'career');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/version 1/i);
  });

  it('says plainly when a save comes from a newer build', () => {
    const result = migrateSave({ schemaVersion: CAREER_SCHEMA_VERSION + 5 }, 'career');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/newer version/i);
  });

  it('never mutates the document it was given', () => {
    const document = structuredClone(V1_FIXTURE) as unknown as Record<string, unknown>;
    const before = JSON.stringify(document);
    migrateSave(document, 'career');
    expect(JSON.stringify(document)).toBe(before);
  });
});
