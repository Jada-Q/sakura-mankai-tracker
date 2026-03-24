import "dotenv/config";
import { google } from "googleapis";

async function publishToWeb() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");

  const credentials = JSON.parse(Buffer.from(json, "base64").toString("utf-8"));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });

  const drive = google.drive({ version: "v3", auth });
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("SPREADSHEET_ID not set");

  // Publish the file to the web (makes CSV/HTML export endpoints work)
  await drive.revisions.update({
    fileId: spreadsheetId,
    revisionId: "head",
    requestBody: {
      published: true,
      publishAuto: true,
    },
  });

  console.log("Sheet published to web!");
  console.log(`CSV URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv`);
}

publishToWeb().catch(console.error);
