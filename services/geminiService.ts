import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedRecord } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("找不到 API_KEY。請在 Vercel 設定中新增環境變數並重新部署 (Redeploy)。");
  }
  return new GoogleGenAI({ apiKey });
};

const MODEL_NAME = "gemini-3-flash-preview";

const SYSTEM_INSTRUCTION = `
你是一個專業的資料擷取助理，專門負責分析公務人員考績評分清冊。
你的首要目標是「精準擷取」，特別是人名與數字，絕對不能有錯字。
`;

const PROMPT_TEXT = `
請分析提供的考績評分清冊資料。
請擷取表格中所有人員的清單。

對於每一個人，請準確擷取以下三個欄位：
1. **姓名**：姓名欄位。
2. **單位/職稱**：將單位與職稱合併，中間加空格。
3. **單位主管擬評**：擷取該員的主管評分數字。

請以 JSON 陣列格式回傳資料。如果找不到任何符合的資料，請回傳空陣列 []。
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
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Image,
        },
      });
    }

    let textPrompt = PROMPT_TEXT;
    if (textContent) {
      textPrompt = `[參考文字內容]\n${textContent}\n\n${PROMPT_TEXT}`;
    }
    
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
    console.log(`[Gemini Response - ${fileName} Page ${pageNumber}]:`, textResponse);
    
    if (!textResponse || textResponse.trim() === "") {
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
    console.error("Gemini Extraction Error:", error);
    let customError = error.message || "擷取資料失敗";
    if (error.message?.includes("429")) customError = "API 請求過於頻繁 (429)，請稍候再試。";
    if (error.message?.includes("API_KEY_INVALID")) customError = "API 金鑰無效，請檢查環境變數。";
    throw new Error(customError);
  }
};