import "dotenv/config";
import { google } from "googleapis";

async function main() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!;
  const creds = JSON.parse(Buffer.from(json, "base64").toString("utf-8"));
  const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.get({ spreadsheetId: process.env.SPREADSHEET_ID! });
  for (const s of res.data.sheets!) {
    console.log(`"${s.properties!.title}" → gid=${s.properties!.sheetId}`);
  }
}
main();
