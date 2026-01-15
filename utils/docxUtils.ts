import mammoth from 'mammoth';

export const extractTextFromDocx = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value; // The raw text
  } catch (error) {
    console.error("Error extracting text from DOCX:", error);
    throw new Error("無法讀取 Word 檔案內容");
  }
};