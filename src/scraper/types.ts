// === Bloom Status (unified, ordered by lifecycle) ===
export type BloomStatus =
  | "つぼみ"
  | "咲き始め"
  | "5分咲き"
  | "7分咲き"
  | "満開"
  | "散り始め"
  | "青葉"; // leaves only, season over

// === Data Confidence Tier ===
export type DataTier = "A" | "B" | "C";

// === A Tier: JMA Official Observation ===
export interface JMALocation {
  tier: "A";
  region: string;
  locationName: string;
  observationDate: string | null;
  normalDiff: string | null;
  normalDate: string | null;
  lastYearDiff: string | null;
  lastYearDate: string | null;
  cherryType: string;
  bloomStatus: BloomStatus;
  coordinates: { lat: number; lng: number } | null;
}

// === B Tier: Walker+ Spot with Observed Status ===
export interface WalkerSpotObserved {
  tier: "B";
  spotName: string;
  prefecture: string;
  city: string;
  bloomStatus: BloomStatus;
  bloomRaw: string;
  viewingSeason: string;
  tags: string[];
  detailUrl: string;
  imageUrl: string | null;
  coordinates: { lat: number; lng: number } | null;
}

// === C Tier: Walker+ Spot without Status (Estimated) ===
export interface WalkerSpotEstimated {
  tier: "C";
  spotName: string;
  prefecture: string;
  city: string;
  bloomStatus: BloomStatus;
  estimatedFrom: string; // name of JMA point used
  viewingSeason: string;
  tags: string[];
  detailUrl: string;
  imageUrl: string | null;
  coordinates: { lat: number; lng: number } | null;
}

export type SakuraSpot = JMALocation | WalkerSpotObserved | WalkerSpotEstimated;

// === Scrape Results ===
export interface JMAScrapeResult {
  title: string;
  scrapedAt: string;
  locations: JMALocation[];
}

export interface WalkerRawSpot {
  spotName: string;
  prefecture: string;
  city: string;
  bloomRaw: string;
  viewingSeason: string;
  tags: string[];
  detailUrl: string;
  imageUrl: string | null;
  coordinates: { lat: number; lng: number } | null;
}

export interface WalkerScrapeResult {
  scrapedAt: string;
  totalSpots: number;
  spots: WalkerRawSpot[];
}

// === Utility: map Walker+ raw status to BloomStatus ===
export function parseBloomStatus(raw: string): BloomStatus | null {
  const map: Record<string, BloomStatus> = {
    つぼみ: "つぼみ",
    咲き始め: "咲き始め",
    "5分咲き": "5分咲き",
    "7分咲き": "7分咲き",
    満開: "満開",
    散り始め: "散り始め",
    青葉: "青葉",
  };
  return map[raw] ?? null;
}
