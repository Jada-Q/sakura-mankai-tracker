# 🌸 Sakura Mankai Tracker

Automated three-tier cherry-blossom (満開 / full-bloom) tracker for Japan —
1,400+ spots sourced from JMA and Walker+, refreshed on a schedule and written
to a Google Sheet.

## What it does
- Scrapes bloom status for 1,400+ spots (JMA + Walker+)
- Three-tier classification of bloom state
- Writes results to a Google Sheet (`桜満開状況`)
- Runs automatically via GitHub Actions

## Tech
Node + TypeScript (`tsx`) · axios + cheerio (scraping) · googleapis (Sheets) ·
MiniMax (OpenAI-compatible SDK) · dotenv

## Setup
```bash
npm install
cp .env.example .env   # fill MINIMAX_API_KEY, GOOGLE_SERVICE_ACCOUNT_JSON, SPREADSHEET_ID
npm start
```

## License
MIT
