import "dotenv/config";
import { scrapeJMA } from "./scraper/jma-scraper.js";
import { scrapeWalker } from "./scraper/walker-scraper.js";
import { classifyWalkerSpots } from "./scraper/estimator.js";
import { analyzeBloomStatus } from "./ai/bloom-analyzer.js";
import { updateSheet } from "./sheets/sheets-client.js";
import { logger } from "./utils/logger.js";
import type { SakuraSpot } from "./scraper/types.js";

function isInSeason(): boolean {
  const jstMonth =
    new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
    ).getMonth() + 1;
  return jstMonth >= 1 && jstMonth <= 6;
}

async function main() {
  logger.info("🌸 Sakura Mankai Tracker starting...");

  if (!isInSeason()) {
    logger.info("Off-season (outside Jan-Jun JST). Hibernating. 💤");
    return;
  }

  // Step 1: Scrape JMA (A tier)
  logger.info("Step 1: Scraping JMA data (mankai + kaika)...");
  const jmaResult = await scrapeJMA();
  logger.info(`A tier: ${jmaResult.locations.length} JMA observation points`);

  // Step 2: Scrape Walker+ (B + C tier)
  logger.info("Step 2: Scraping Walker+ spots (nationwide)...");
  const walkerResult = await scrapeWalker();
  logger.info(`Walker+: ${walkerResult.totalSpots} spots scraped`);

  // Step 3: Classify Walker+ spots into B (observed) and C (estimated)
  logger.info("Step 3: Classifying spots...");
  const { observed, estimated } = classifyWalkerSpots(
    walkerResult.spots,
    jmaResult.locations
  );
  logger.info(`B tier: ${observed.length} spots with observed status`);
  logger.info(`C tier: ${estimated.length} spots with estimated status`);

  // Step 4: AI Analysis on JMA data (optional, non-blocking)
  logger.info("Step 4: Running AI analysis...");
  let aiAnalysis = null;
  if (process.env.MINIMAX_API_KEY) {
    aiAnalysis = await analyzeBloomStatus(jmaResult.locations);
    if (aiAnalysis) {
      logger.info(`AI analysis: ${aiAnalysis.summary}`);
    } else {
      logger.warn("AI analysis returned null, continuing without it");
    }
  } else {
    logger.warn("MINIMAX_API_KEY not set, skipping AI analysis");
  }

  // Step 5: Merge all tiers and update Sheet
  const allSpots: SakuraSpot[] = [
    ...jmaResult.locations, // A tier first
    ...observed, // B tier
    ...estimated, // C tier
  ];

  logger.info(
    `Total: ${allSpots.length} spots (A:${jmaResult.locations.length} B:${observed.length} C:${estimated.length})`
  );

  // Status summary across all tiers
  const statusCounts = new Map<string, number>();
  for (const s of allSpots) {
    statusCounts.set(s.bloomStatus, (statusCounts.get(s.bloomStatus) || 0) + 1);
  }
  const statusStr = [...statusCounts.entries()]
    .map(([k, v]) => `${k}:${v}`)
    .join(" ");
  logger.info(`Status: ${statusStr}`);

  logger.info("Step 5: Updating Google Sheet...");
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.SPREADSHEET_ID) {
    await updateSheet(allSpots, aiAnalysis);
    logger.info("Google Sheet updated successfully ✅");
  } else {
    logger.warn("Google Sheets credentials not set, skipping sheet update");
    // Console summary
    const mankaiSpots = allSpots.filter((s) => s.bloomStatus === "満開");
    logger.info(`\n🌸 満開 spots (${mankaiSpots.length}):`);
    for (const s of mankaiSpots) {
      const name = s.tier === "A" ? s.locationName : s.spotName;
      logger.info(`  [${s.tier}] ${name}`);
    }
  }

  logger.info("🌸 Pipeline complete!");
}

main().catch((error) => {
  logger.error("Pipeline failed", error);
  process.exit(1);
});
