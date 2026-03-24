import { getMiniMaxClient } from "./minimax-client.js";
import type { JMALocation } from "../scraper/types.js";
import { logger } from "../utils/logger.js";

export interface AILocationAnalysis {
  name: string;
  status: string;
  comment: string;
}

export interface AIAnalysis {
  summary: string;
  locations: AILocationAnalysis[];
}

const SYSTEM_PROMPT = `あなたは日本の桜の開花状況を分析する専門家です。
JMA（気象庁）の公式観測データを受け取り、分析結果をJSON形式で返します。
回答は必ず有効なJSONのみを返してください。マークダウンや説明文は不要です。`;

function buildUserPrompt(locations: JMALocation[]): string {
  const data = locations.map((l) => ({
    地点: l.locationName,
    地域: l.region,
    状態: l.bloomStatus,
    満開日: l.observationDate || "未観測",
    平年日: l.normalDate,
    種類: l.cherryType,
  }));

  return `以下の桜満開観測データを分析してください：

${JSON.stringify(data, null, 2)}

タスク：
1. 各地点の満開状態を確認（観測日があれば満開確定）
2. まだ満開でない地点について、近隣の地点の状況と平年日から予想コメントを生成
3. 全体の概況サマリーを50文字以内で作成

以下のJSON形式で回答してください：
{
  "summary": "全体概況（50文字以内）",
  "locations": [
    {
      "name": "地点名",
      "status": "満開" | "咲き始め" | "つぼみ" | "散り始め",
      "comment": "コメント（20文字以内）"
    }
  ]
}`;
}

function validateAnalysis(data: unknown): AIAnalysis | null {
  if (!data || typeof data !== "object") return null;

  const obj = data as Record<string, unknown>;
  if (typeof obj.summary !== "string") return null;
  if (!Array.isArray(obj.locations)) return null;

  const validLocations: AILocationAnalysis[] = [];
  for (const loc of obj.locations) {
    if (
      loc &&
      typeof loc === "object" &&
      typeof (loc as Record<string, unknown>).name === "string" &&
      typeof (loc as Record<string, unknown>).comment === "string"
    ) {
      validLocations.push({
        name: (loc as Record<string, unknown>).name as string,
        status: String((loc as Record<string, unknown>).status ?? ""),
        comment: (loc as Record<string, unknown>).comment as string,
      });
    }
  }

  if (validLocations.length === 0) return null;

  return { summary: obj.summary as string, locations: validLocations };
}

export async function analyzeBloomStatus(
  locations: JMALocation[]
): Promise<AIAnalysis | null> {
  try {
    const client = getMiniMaxClient();

    logger.info(
      `Sending ${locations.length} locations to MiniMax for analysis...`
    );

    const response = await client.chat.completions.create({
      model: "MiniMax-M2.5",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(locations) },
      ],
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      logger.warn("MiniMax returned empty response");
      return null;
    }

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonStr = content.replace(/```json\n?|\n?```/g, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      logger.warn("MiniMax returned invalid JSON", jsonStr.slice(0, 200));
      return null;
    }

    const analysis = validateAnalysis(parsed);
    if (!analysis) {
      logger.warn("MiniMax response failed validation", parsed);
      return null;
    }

    logger.info(`AI Summary: ${analysis.summary}`);
    logger.info(
      `Token usage: ${response.usage?.prompt_tokens} in / ${response.usage?.completion_tokens} out`
    );

    return analysis;
  } catch (error) {
    logger.error("MiniMax analysis failed", error);
    return null;
  }
}
