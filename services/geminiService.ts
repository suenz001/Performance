import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedRecord } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === 'undefined' || apiKey.length < 10 || apiKey.includes('process.env')) {
    throw new Error("API_KEY_NOT_SET");
  }
  return new GoogleGenAI({ apiKey });
};

const MODEL_NAME = "gemini-3-flash-preview";

const SYSTEM_INSTRUCTION = `
你是一個專業的台灣公務機關考績清冊資料擷取專家。
你的任務是從表格影像或文字中，精準提取「單位/職稱」、「姓名」與「單位主管擬評」三項資訊。
`;

const PROMPT_TEXT = `
請分析提供的考績評分清冊。
請提取表格中每一位受評人的資訊。

欄位說明：
1. **單位與職稱**：通常在表格的最左側欄位，請將兩者合併（例如：教務處 組長）。
2. **姓名**：受評人的真實姓名。
3. **單位主管擬評**：這可能是分數（如 85, 90）或是等級（如 甲, A），請務必精準對應。

規則：
- 如果該頁面不是考績表，請回傳空陣列 []。
- 請以 JSON 陣列格式回傳。
- 欄位名稱必須為：unitTitle, name, supervisorRating。
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

    const textPrompt = textContent ? `[文字層資訊可供參考]\n${textContent}\n\n${PROMPT_TEXT}` : PROMPT_TEXT;
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
              unitTitle: { type: Type.STRING },
              name: { type: Type.STRING },
              supervisorRating: { type: Type.STRING },
            },
            required: ["unitTitle", "name", "supervisorRating"],
          },
        },
      },
      contents: { parts },
    });

    const textResponse = response.text;
    if (!textResponse || textResponse.trim() === "[]") return [];

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
    console.error("Gemini Extraction Error Detail:", error);
    const errorStr = error.toString().toLowerCase();
    
    // 將 API 錯誤細節回傳給前端
    if (errorStr.includes("expired") || errorStr.includes("400") || errorStr.includes("invalid")) {
      throw new Error(`API KEY 無效或已過期 (原始錯誤: ${error.message})`);
    }
    
    if (errorStr.includes("403")) {
      throw new Error(`API KEY 權限不足或被限制 (403)`);
    }
    
    throw new Error(error.message || "AI 服務暫時無法回應，請稍後再試。");
  }
};