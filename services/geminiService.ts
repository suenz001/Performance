import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedRecord } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("找不到 API_KEY。請在 Vercel 設定中新增環境變數並重新部署。");
  }
  return new GoogleGenAI({ apiKey });
};

const MODEL_NAME = "gemini-3-flash-preview";

const SYSTEM_INSTRUCTION = `
你是一個專業的公務人員考績資料擷取專家。
你的任務是從「考績評分清冊」的圖片或文字中，精準提取表格內容。
即使表格格式不完全標準，也要盡力辨識姓名與擬評分數。
`;

const PROMPT_TEXT = `
請分析這張考績清冊內容，提取所有人員的資料。
請特別注意：
1. **單位與職稱**：通常在左側，請合併為一個字串。
2. **姓名**：中間欄位。
3. **單位主管擬評**：這是一個數字（通常是 1 到 100 之間，或是 A/B/C 等級），請務必找到對應的評分。

請回傳一個 JSON 陣列。即使只有一筆也要回傳陣列。
如果畫面上看起來像表格但你無法確定，請給出最可能的猜測。
回傳欄位：unitTitle, name, supervisorRating。
`;

interface ExtractOptions {
  base64Image?: string;
  textContent?: string;
  fileName: string;
  pageNumber: number;
}

export const extractDataFromDocument = async ({
  base64Image,
  textContent,
  fileName,
  pageNumber
}: ExtractOptions): Promise<ExtractedRecord[]> => {
  try {
    const ai = getAIClient();
    const parts: any[] = [];

    if (base64Image) {
      parts.push({
        inlineData: { mimeType: "image/jpeg", data: base64Image }
      });
    }

    const textPrompt = textContent ? `[文字層參考]\n${textContent}\n\n${PROMPT_TEXT}` : PROMPT_TEXT;
    parts.push({ text: textPrompt });

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              unitTitle: { type: Type.STRING, description: "單位與職稱" },
              name: { type: Type.STRING, description: "姓名" },
              supervisorRating: { type: Type.STRING, description: "主管擬評分數或等級" },
            },
            required: ["unitTitle", "name", "supervisorRating"],
          },
        },
      },
      contents: { parts },
    });

    const textResponse = response.text;
    if (!textResponse || textResponse.trim() === "[]") {
      console.log(`Page ${pageNumber}: No data found.`);
      return [];
    }

    const parsedData = JSON.parse(textResponse);
    return parsedData.map((item: any, index: number) => ({
      id: `${fileName}-${pageNumber}-${index}-${Date.now()}`,
      fileName,
      pageNumber,
      unitTitle: item.unitTitle || "",
      name: item.name || "",
      supervisorRating: item.supervisorRating || "",
    }));
  } catch (error: any) {
    console.error("Gemini API Error Detail:", error);
    
    const errorString = error.toString();
    
    // 偵測金鑰洩漏 (403 Forbidden)
    if (errorString.includes("403") || errorString.includes("leaked")) {
      throw new Error("API_KEY_LEAKED");
    }
    
    if (errorString.includes("429")) {
      throw new Error("請求過於頻繁 (429)，請稍候再試。");
    }

    throw new Error(error.message || "擷取失敗，請確認 API 金鑰是否有效。");
  }
};