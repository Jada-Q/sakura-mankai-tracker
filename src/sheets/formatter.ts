import type { BloomStatus, SakuraSpot } from "../scraper/types.js";

interface Color {
  red: number;
  green: number;
  blue: number;
}

const STATUS_DISPLAY: Record<BloomStatus, { emoji: string; color: Color }> = {
  つぼみ: {
    emoji: "",
    color: { red: 0.91, green: 0.96, blue: 0.914 }, // #E8F5E9
  },
  咲き始め: {
    emoji: "🌱",
    color: { red: 1, green: 0.894, blue: 0.91 }, // #FFE4E8
  },
  "5分咲き": {
    emoji: "🌷",
    color: { red: 1, green: 0.82, blue: 0.86 }, // #FFD1DB
  },
  "7分咲き": {
    emoji: "🌸",
    color: { red: 1, green: 0.76, blue: 0.82 }, // #FFC2D1
  },
  満開: {
    emoji: "🌸",
    color: { red: 1, green: 0.718, blue: 0.773 }, // #FFB7C5
  },
  散り始め: {
    emoji: "🍃",
    color: { red: 0.96, green: 0.96, blue: 0.96 }, // #F5F5F5
  },
  青葉: {
    emoji: "🌿",
    color: { red: 0.85, green: 0.92, blue: 0.85 }, // #D9EBD9
  },
};

const TIER_LABELS: Record<string, string> = {
  A: "🅰 気象庁",
  B: "🅱 実測",
  C: "🅲 推定",
};

export function getStatusColor(status: BloomStatus): Color {
  return STATUS_DISPLAY[status].color;
}

export function formatStatusText(status: BloomStatus): string {
  const { emoji } = STATUS_DISPLAY[status];
  return emoji ? `${emoji} ${status}` : status;
}

export function formatSpotRow(spot: SakuraSpot): string[] {
  const tierLabel = TIER_LABELS[spot.tier];
  const statusText = formatStatusText(spot.bloomStatus);

  if (spot.tier === "A") {
    return [
      tierLabel,
      spot.locationName,
      spot.region,
      statusText,
      spot.observationDate || "--",
      spot.normalDate || "--",
      spot.coordinates ? String(spot.coordinates.lat) : "--",
      spot.coordinates ? String(spot.coordinates.lng) : "--",
      "", // tags
      "", // note
    ];
  }

  if (spot.tier === "B") {
    return [
      tierLabel,
      spot.spotName,
      `${spot.prefecture}${spot.city}`,
      statusText,
      "--",
      spot.viewingSeason,
      "--",
      "--",
      spot.tags.slice(0, 3).join(", "),
      "",
    ];
  }

  // C tier
  return [
    tierLabel,
    spot.spotName,
    `${spot.prefecture}${spot.city}`,
    statusText,
    "--",
    spot.viewingSeason,
    "--",
    "--",
    spot.tags.slice(0, 3).join(", "),
    `推定(${spot.estimatedFrom})`,
  ];
}

export const HEADER_ROW = [
  "データ層",
  "地点/景点",
  "地域",
  "状態",
  "観測日",
  "平年日/見頃",
  "緯度",
  "経度",
  "タグ",
  "備考",
];
