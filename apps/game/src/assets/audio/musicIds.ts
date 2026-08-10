/**
 * The five delivered farming loops.
 *
 * Only the default track is decoded at boot. The alternatives stay lazy in
 * the manifest so shipping choices do not turn into a 19.5 MB startup cost.
 */
export const MUSIC = {
  sunriseRows: 'music.sunrise_rows',
  marketDay: 'music.market_day',
  rainOnTin: 'music.rain_on_tin',
  goldenHarvest: 'music.golden_harvest',
  quietOutback: 'music.quiet_outback',
} as const;

export type MusicId = (typeof MUSIC)[keyof typeof MUSIC];

export interface MusicTrack {
  readonly id: MusicId;
  readonly title: string;
  readonly mood: string;
}

export const MUSIC_TRACKS: readonly MusicTrack[] = [
  {
    id: MUSIC.sunriseRows,
    title: 'Sunrise Rows',
    mood: 'Optimistic fingerpicked morning theme; the default farm loop.',
  },
  {
    id: MUSIC.marketDay,
    title: 'Market Day',
    mood: 'Friendly, productive mandolin and acoustic-guitar daytime loop.',
  },
  {
    id: MUSIC.rainOnTin,
    title: 'Rain on Tin',
    mood: 'Reflective nylon guitar, accordion and fiddle without literal rain ambience.',
  },
  {
    id: MUSIC.goldenHarvest,
    title: 'Golden Harvest',
    mood: 'Warm dulcimer, guitar and cello-pizzicato harvest loop.',
  },
  {
    id: MUSIC.quietOutback,
    title: 'Quiet Outback',
    mood: 'Sparse, peaceful evening loop for long low-pressure sessions.',
  },
];

export const DEFAULT_MUSIC_ID: MusicId = MUSIC.sunriseRows;
export const ALL_MUSIC_IDS = MUSIC_TRACKS.map((track) => track.id);
