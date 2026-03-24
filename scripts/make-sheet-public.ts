import "dotenv/config";
import { google } from "googleapis";

async function makePublic() {
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

  // Make the sheet publicly readable
  await drive.permissions.create({
    fileId: spreadsheetId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  console.log("Sheet is now public! Anyone with the link can view it.");
  console.log(`https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
}

makePublic().catch(console.error);
