import type {
  JMALocation,
  WalkerRawSpot,
  WalkerSpotObserved,
  WalkerSpotEstimated,
  BloomStatus,
} from "./types.js";
import { parseBloomStatus } from "./types.js";

// Prefecture → JMA observation point name mapping
// Some prefectures have multiple JMA points; use the prefectural capital
const PREF_TO_JMA: Record<string, string> = {
  北海道: "札幌",
  青森県: "青森",
  岩手県: "盛岡",
  宮城県: "仙台",
  秋田県: "秋田",
  山形県: "山形",
  福島県: "福島",
  茨城県: "水戸",
  栃木県: "宇都宮",
  群馬県: "前橋",
  埼玉県: "熊谷",
  千葉県: "銚子",
  東京都: "東京",
  神奈川県: "横浜",
  新潟県: "新潟",
  富山県: "富山",
  石川県: "金沢",
  福井県: "福井",
  山梨県: "甲府",
  長野県: "長野",
  岐阜県: "岐阜",
  静岡県: "静岡",
  愛知県: "名古屋",
  三重県: "津",
  滋賀県: "彦根",
  京都府: "京都",
  大阪府: "大阪",
  兵庫県: "神戸",
  奈良県: "奈良",
  和歌山県: "和歌山",
  鳥取県: "鳥取",
  島根県: "松江",
  岡山県: "岡山",
  広島県: "広島",
  山口県: "下関",
  徳島県: "徳島",
  香川県: "高松",
  愛媛県: "松山",
  高知県: "高知",
  福岡県: "福岡",
  佐賀県: "佐賀",
  長崎県: "長崎",
  熊本県: "熊本",
  大分県: "大分",
  宮崎県: "宮崎",
  鹿児島県: "鹿児島",
  沖縄県: "那覇",
};

/**
 * Classify Walker+ raw spots into B tier (observed) and C tier (estimated).
 */
export function classifyWalkerSpots(
  rawSpots: WalkerRawSpot[],
  jmaLocations: JMALocation[]
): {
  observed: WalkerSpotObserved[];
  estimated: WalkerSpotEstimated[];
} {
  // Build JMA lookup by location name
  const jmaMap = new Map<string, JMALocation>();
  for (const loc of jmaLocations) {
    jmaMap.set(loc.locationName, loc);
  }

  const observed: WalkerSpotObserved[] = [];
  const estimated: WalkerSpotEstimated[] = [];

  for (const spot of rawSpots) {
    const status = parseBloomStatus(spot.bloomRaw);

    if (status !== null) {
      // B tier: has observed status
      observed.push({
        tier: "B",
        spotName: spot.spotName,
        prefecture: spot.prefecture,
        city: spot.city,
        bloomStatus: status,
        bloomRaw: spot.bloomRaw,
        viewingSeason: spot.viewingSeason,
        tags: spot.tags,
        detailUrl: spot.detailUrl,
        imageUrl: spot.imageUrl,
      });
    } else {
      // C tier: estimate from nearest JMA point
      const jmaName = PREF_TO_JMA[spot.prefecture];
      const jmaPoint = jmaName ? jmaMap.get(jmaName) : undefined;
      const estimatedStatus: BloomStatus = jmaPoint?.bloomStatus ?? "つぼみ";

      estimated.push({
        tier: "C",
        spotName: spot.spotName,
        prefecture: spot.prefecture,
        city: spot.city,
        bloomStatus: estimatedStatus,
        estimatedFrom: jmaName || "不明",
        viewingSeason: spot.viewingSeason,
        tags: spot.tags,
        detailUrl: spot.detailUrl,
        imageUrl: spot.imageUrl,
      });
    }
  }

  return { observed, estimated };
}
