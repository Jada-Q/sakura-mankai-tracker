import axios from "axios";
import * as cheerio from "cheerio";
import type { WalkerRawSpot, WalkerScrapeResult } from "./types.js";
import { logger } from "../utils/logger.js";

const BASE_URL = "https://hanami.walkerplus.com";
const TIMEOUT_MS = 15_000;
const DELAY_MS = 1_500; // polite delay between requests

// All prefecture/region codes for nationwide scraping
const REGION_CODES = [
  "ar0101", // 北海道
  "ar0200", // 東北
  "ar0300", // 関東 (includes Tokyo area spots not in ar0313)
  "ar0313", // 東京
  "ar0400", // 甲信越
  "ar0500", // 北陸
  "ar0600", // 東海
  "ar0700", // 関西 (includes Kyoto)
  "ar0800", // 中国
  "ar0900", // 四国
  "ar1000", // 九州・沖縄
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseListPage(html: string): {
  spots: WalkerRawSpot[];
  totalPages: number;
} {
  const $ = cheerio.load(html);
  const spots: WalkerRawSpot[] = [];

  // Parse JSON-LD for structured data (name, address, image, url)
  const jsonLdMap = new Map<
    string,
    { name: string; prefecture: string; city: string; imageUrl: string | null }
  >();
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || "");
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item["@type"] === "Event" && item.url) {
          const addr = item.location?.address || {};
          jsonLdMap.set(item.url, {
            name: item.name || "",
            prefecture: addr.addressRegion || "",
            city: addr.addressLocality || "",
            imageUrl: item.image || null,
          });
        }
      }
    } catch {}
  });

  // Parse spot cards from HTML
  $("article").each((_, el) => {
    const link = $(el).find('a[href*="/detail/"]').first();
    const href = link.attr("href") || "";
    if (!href) return;

    const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const jsonLd = jsonLdMap.get(fullUrl);

    // Prefer JSON-LD name (clean), fallback to h3 text
    const spotName = jsonLd?.name || $(el).find("h3").first().text().trim() || "";

    // Extract bloom status from "開花情報：XXX"
    let bloomRaw = "なし";
    $(el)
      .find(".detail")
      .each((_, detail) => {
        const text = $(detail).text().trim();
        const match = text.match(/開花情報：(.+)/);
        if (match) {
          bloomRaw = match[1].trim();
        }
      });

    // Extract viewing season
    let viewingSeason = "";
    $(el)
      .find(".detail")
      .each((_, detail) => {
        const text = $(detail).text().trim();
        const match = text.match(/例年の見頃：(.+)/);
        if (match) {
          viewingSeason = match[1].trim();
        }
      });

    // Extract tags (夜桜, 屋台, etc.)
    const tags: string[] = [];
    $(el)
      .find(".tag, [class*='icon-ico']")
      .each((_, tag) => {
        const t = $(tag).parent().text().trim();
        if (t && !tags.includes(t)) tags.push(t);
      });
    // Also extract from text patterns
    const cardText = $(el).text();
    for (const tag of [
      "夜桜・ライトアップ",
      "桜祭り開催",
      "駅から徒歩10分以内",
      "屋台",
      "公園",
      "庭園・神社",
      "国指定名勝",
    ]) {
      if (cardText.includes(tag) && !tags.includes(tag)) {
        tags.push(tag);
      }
    }

    spots.push({
      spotName,
      prefecture: jsonLd?.prefecture || "",
      city: jsonLd?.city || "",
      bloomRaw,
      viewingSeason,
      tags,
      detailUrl: fullUrl,
      imageUrl: jsonLd?.imageUrl || null,
      coordinates: null, // filled later by fetchCoordinates
    });
  });

  // Parse total pages from pager
  let totalPages = 1;
  $(".pager a").each((_, el) => {
    const text = $(el).text().trim();
    const num = parseInt(text, 10);
    if (!isNaN(num) && num > totalPages) totalPages = num;
  });

  return { spots, totalPages };
}

async function scrapeRegion(regionCode: string): Promise<WalkerRawSpot[]> {
  const allSpots: WalkerRawSpot[] = [];

  // Fetch page 1
  const firstUrl = `${BASE_URL}/list/${regionCode}/`;
  let html: string;
  try {
    const res = await axios.get(firstUrl, {
      responseType: "text",
      timeout: TIMEOUT_MS,
    });
    html = res.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      logger.warn(`Region ${regionCode} returned 404, skipping`);
      return [];
    }
    throw error;
  }

  const { spots, totalPages } = parseListPage(html);
  allSpots.push(...spots);
  logger.debug(
    `${regionCode} page 1/${totalPages}: ${spots.length} spots`
  );

  // Fetch remaining pages
  for (let page = 2; page <= totalPages; page++) {
    await sleep(DELAY_MS);
    const pageUrl = `${BASE_URL}/list/${regionCode}/${page}.html`;
    try {
      const res = await axios.get(pageUrl, {
        responseType: "text",
        timeout: TIMEOUT_MS,
      });
      const result = parseListPage(res.data);
      allSpots.push(...result.spots);
      logger.debug(
        `${regionCode} page ${page}/${totalPages}: ${result.spots.length} spots`
      );
    } catch (error) {
      logger.warn(`Failed to fetch ${pageUrl}, skipping`);
    }
  }

  return allSpots;
}

async function fetchSpotCoordinates(
  spot: WalkerRawSpot
): Promise<{ lat: number; lng: number } | null> {
  try {
    // Extract coordinates from the map.html subpage
    const mapUrl = spot.detailUrl.replace(/\/?$/, "/map.html");
    const res = await axios.get(mapUrl, {
      responseType: "text",
      timeout: TIMEOUT_MS,
    });
    const match = res.data.match(/q=([\d.]+),([\d.]+)/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng) && lat > 20 && lat < 50 && lng > 120 && lng < 155) {
        return { lat, lng };
      }
    }
    return null;
  } catch {
    return null;
  }
}

const CONCURRENCY = 10; // parallel requests for coordinate fetching
const COORD_DELAY_MS = 200; // small delay between batches

async function fetchAllCoordinates(spots: WalkerRawSpot[]): Promise<void> {
  let fetched = 0;
  for (let i = 0; i < spots.length; i += CONCURRENCY) {
    const batch = spots.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((spot) => fetchSpotCoordinates(spot))
    );
    results.forEach((coords, j) => {
      if (coords) {
        spots[i + j].coordinates = coords;
        fetched++;
      }
    });
    if (i + CONCURRENCY < spots.length) {
      await sleep(COORD_DELAY_MS);
    }
    if ((i + CONCURRENCY) % 100 === 0 || i + CONCURRENCY >= spots.length) {
      logger.info(
        `Coordinates: ${fetched}/${spots.length} fetched (${Math.min(i + CONCURRENCY, spots.length)} processed)`
      );
    }
  }
  logger.info(`Coordinates complete: ${fetched}/${spots.length} spots geocoded`);
}

export async function scrapeWalker(): Promise<WalkerScrapeResult> {
  logger.info(`Scraping Walker+ spots from ${REGION_CODES.length} regions...`);

  const allSpots: WalkerRawSpot[] = [];
  const seenUrls = new Set<string>();

  for (const code of REGION_CODES) {
    const spots = await scrapeRegion(code);
    // Deduplicate (Tokyo spots may appear in both ar0300 and ar0313)
    for (const spot of spots) {
      if (!seenUrls.has(spot.detailUrl)) {
        seenUrls.add(spot.detailUrl);
        allSpots.push(spot);
      }
    }
    logger.info(
      `Region ${code}: ${spots.length} spots (${allSpots.length} total unique)`
    );
    await sleep(DELAY_MS);
  }

  // Fetch coordinates from map.html pages (concurrent batches)
  logger.info(`Fetching coordinates for ${allSpots.length} spots...`);
  await fetchAllCoordinates(allSpots);

  return {
    scrapedAt: new Date().toISOString(),
    totalSpots: allSpots.length,
    spots: allSpots,
  };
}
