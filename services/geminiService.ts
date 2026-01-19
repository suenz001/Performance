import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedRecord } from "../types";

// Initialize Gemini Client
// The API key must be obtained exclusively from the environment variable process.env.API_KEY.
const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("找不到 API_KEY。請在 Vercel 設定中新增環境變數並重新部署。");
  }
  return new GoogleGenAI({ apiKey });
};

const MODEL_NAME = "gemini-3-flash-preview";

const SYSTEM_INSTRUCTION = `
你是一個專業的資料擷取助理，專門負責分析公務人員考績評分清冊。
你的首要目標是「精準擷取」，特別是人名與數字，絕對不能有錯字。
`;

const PROMPT_TEXT = `
請分析提供的考績評分清冊資料（可能是影像或純文字）。
請擷取表格中所有人員的清單。

**重要指示：**
1. 資料來源若是文字，請直接解析結構。
2. 資料來源若是影像，請優先參考附帶的文字層內容（若有），以確保人名一字不差。

對於每一個人，請準確擷取以下三個欄位：

1. **姓名**：通常在左側第一欄。
2. **單位/職稱**：通常在第二欄。
    * 上面一行是單位（例如：綜合規劃處）。
    * 下面一行是職稱（例如：處長、視察、秘書）。
    * **動作**：將它們合併為一個字串，中間用一個空格分隔（例如："綜合規劃處 處長"）。
3. **單位主管擬評**：尋找標示為「單位主管擬評」或類似的欄位。這是一個數字分數（例如：90, 87, 86, 82）。
    * 它通常位於表格右側，在考績會複核欄位之前。
    * 只擷取數字。

如果某一行是空的，或包含彙總資料（如「人事主管」、「備考」），請忽略。
請以 JSON 陣列格式回傳資料。
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
      if (base64Image) {
        textPrompt = `[參考用 PDF 文字層內容開始]\n${textContent}\n[參考用 PDF 文字層內容結束]\n\n${PROMPT_TEXT}`;
      } else {
        textPrompt = `[Word 文件文字內容開始]\n${textContent}\n[Word 文件文字內容結束]\n\n${PROMPT_TEXT}`;
      }
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
      contents: {
        parts: parts,
      },
    });

    const textResponse = response.text;
    if (!textResponse) return [];

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
    
    // 辨識常見錯誤代碼
    let customError = "擷取資料失敗";
    if (error.message?.includes("429")) {
      customError = "API 請求次數過多 (Rate Limit Exceeded)。請稍候一分鐘再試，或更換付費版 API 金鑰。";
    } else if (error.message?.includes("401") || error.message?.includes("API_KEY_INVALID")) {
      customError = "API 金鑰無效或已過期。請檢查 Vercel 環境變數設定。";
    } else if (error.message?.includes("403")) {
      customError = "權限不足。請確認 API 金鑰是否具有訪問 Gemini API 的權限，或是否已開啟帳單設定。";
    } else if (error.message?.includes("500")) {
      customError = "Google 伺服器忙碌中，請稍後再試。";
    } else if (error.message) {
      customError = error.message;
    }

    throw new Error(customError);
  }
};