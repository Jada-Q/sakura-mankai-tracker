import { google, type sheets_v4 } from "googleapis";
import type { SakuraSpot } from "../scraper/types.js";
import type { AIAnalysis } from "../ai/bloom-analyzer.js";
import { formatSpotRow, getStatusColor, HEADER_ROW } from "./formatter.js";
import { logger } from "../utils/logger.js";

function getAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");

  const credentials = JSON.parse(
    Buffer.from(json, "base64").toString("utf-8")
  );
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getJSTYear(): number {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  ).getFullYear();
}

function getSheetName(): string {
  return `🌸 ${getJSTYear()}`;
}

async function ensureSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string
): Promise<number> {
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = res.data.sheets?.find(
    (s) => s.properties?.title === sheetName
  );

  if (existing) {
    return existing.properties!.sheetId!;
  }

  logger.info(`Creating new sheet tab: ${sheetName}`);
  const addRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    },
  });

  return addRes.data.replies![0].addSheet!.properties!.sheetId!;
}

export async function updateSheet(
  allSpots: SakuraSpot[],
  aiAnalysis: AIAnalysis | null
): Promise<void> {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("SPREADSHEET_ID is not set");

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sheetName = getSheetName();
  const sheetId = await ensureSheet(sheets, spreadsheetId, sheetName);

  // Build AI comment map
  const aiComments = new Map<string, string>();
  if (aiAnalysis) {
    for (const loc of aiAnalysis.locations) {
      aiComments.set(loc.name, loc.comment);
    }
  }

  // Title row
  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const summary = aiAnalysis?.summary || "";
  const tierCounts = {
    A: allSpots.filter((s) => s.tier === "A").length,
    B: allSpots.filter((s) => s.tier === "B").length,
    C: allSpots.filter((s) => s.tier === "C").length,
  };
  const titleRow = [
    `最終更新: ${now}  A層:${tierCounts.A} B層:${tierCounts.B} C層:${tierCounts.C}  ${summary}`,
  ];

  // Data rows — inject AI comments for A tier
  const dataRows = allSpots.map((spot) => {
    const row = formatSpotRow(spot);
    if (spot.tier === "A") {
      const comment = aiComments.get(spot.locationName);
      if (comment) row[9] = comment; // 備考 column
    }
    return row;
  });

  // Clear + write
  const allRows = [titleRow, HEADER_ROW, ...dataRows];
  const range = `'${sheetName}'!A1:J${allRows.length}`;

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${sheetName}'!A:J`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values: allRows },
  });
  logger.info(`Written ${dataRows.length} rows to ${range}`);

  // Color requests — merge consecutive rows with same status color
  const requests: sheets_v4.Schema$Request[] = [];
  let i = 0;
  while (i < allSpots.length) {
    const color = getStatusColor(allSpots[i].bloomStatus);
    let j = i + 1;
    while (j < allSpots.length) {
      const c2 = getStatusColor(allSpots[j].bloomStatus);
      if (c2.red !== color.red || c2.green !== color.green || c2.blue !== color.blue) break;
      j++;
    }
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: i + 2,
          endRowIndex: j + 2,
          startColumnIndex: 3, // column D (状態)
          endColumnIndex: 4,
        },
        cell: {
          userEnteredFormat: { backgroundColor: color },
        },
        fields: "userEnteredFormat.backgroundColor",
      },
    });
    i = j;
  }

  // Freeze header rows
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId,
        gridProperties: { frozenRowCount: 2 },
      },
      fields: "gridProperties.frozenRowCount",
    },
  });

  // Bold header row
  requests.push({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: 1,
        endRowIndex: 2,
        startColumnIndex: 0,
        endColumnIndex: 10,
      },
      cell: {
        userEnteredFormat: { textFormat: { bold: true } },
      },
      fields: "userEnteredFormat.textFormat.bold",
    },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });

  logger.info(`Applied ${requests.length} formatting requests`);
}
