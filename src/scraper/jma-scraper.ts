import axios from "axios";
import * as cheerio from "cheerio";
import type { JMALocation, JMAScrapeResult, BloomStatus } from "./types.js";
import { LOCATIONS } from "../../data/locations.js";
import { logger } from "../utils/logger.js";

const BASE_URL = "https://www.data.jma.go.jp/sakura/data";
const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

async function fetchWithRetry(url: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data } = await axios.get(url, {
        responseType: "text",
        timeout: TIMEOUT_MS,
      });
      return data;
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;
      logger.warn(`Fetch attempt ${attempt} failed, retrying in 5s...`);
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
  throw new Error("unreachable");
}

interface RawLocation {
  region: string;
  locationName: string;
  observationDate: string | null;
  normalDiff: string | null;
  normalDate: string | null;
  lastYearDiff: string | null;
  lastYearDate: string | null;
  cherryType: string;
}

function parseJMATable(html: string): { title: string; locations: RawLocation[] } {
  const $ = cheerio.load(html);
  const title = $("h1").first().text().trim().split("\n")[0];
  const locations: RawLocation[] = [];
  let currentRegion = "";

  $("table tr").each((_, row) => {
    const cells = $(row).find("td, th");
    const cellCount = cells.length;
    const firstText = cells.first().text().trim();
    const colspan = cells.first().attr("colspan");

    if (cellCount === 1 && colspan) {
      currentRegion = firstText.replace(/[【】]/g, "");
      return;
    }
    if (firstText === "地点名") return;

    if (cellCount >= 6) {
      const values = cells.map((_, c) => $(c).text().trim()).get();
      locations.push({
        region: currentRegion,
        locationName: values[0],
        observationDate: values[1] || null,
        normalDiff: values[2] || null,
        normalDate: values[3] || null,
        lastYearDiff: values[4] || null,
        lastYearDate: values[5] === "欠測" ? null : values[5] || null,
        cherryType: values[6] || "そめいよしの",
      });
    }
  });

  return { title, locations };
}

export async function scrapeJMA(): Promise<JMAScrapeResult> {
  const [mankaiHtml, kaikaHtml] = await Promise.all([
    fetchWithRetry(`${BASE_URL}/sakura_mankai.html`),
    fetchWithRetry(`${BASE_URL}/sakura_kaika.html`),
  ]);

  const mankai = parseJMATable(mankaiHtml);
  const kaika = parseJMATable(kaikaHtml);

  const kaikaMap = new Map<string, boolean>();
  for (const loc of kaika.locations) {
    kaikaMap.set(loc.locationName, !!loc.observationDate);
  }

  const locations: JMALocation[] = mankai.locations.map((loc) => {
    let bloomStatus: BloomStatus;
    if (loc.observationDate) {
      bloomStatus = "満開";
    } else if (kaikaMap.get(loc.locationName)) {
      bloomStatus = "咲き始め";
    } else {
      bloomStatus = "つぼみ";
    }

    return {
      tier: "A" as const,
      ...loc,
      bloomStatus,
      coordinates: LOCATIONS[loc.locationName] || null,
    };
  });

  return {
    title: mankai.title,
    scrapedAt: new Date().toISOString(),
    locations,
  };
}
