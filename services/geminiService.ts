
import { GoogleGenAI, Type, Chat } from "@google/genai";
import { Book, BookAnalysis } from "../types";
import { BOOKS_LIST } from "../constants";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1 second

const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelay: number,
): Promise<T> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      // Check for specific error codes or status indicating a need for retry
      const isQuotaError = error?.error?.code === 429 || error?.error?.status === 'RESOURCE_EXHAUSTED';
      const isTransientError = error?.error?.code >= 500 && error?.error?.code < 600; // 5xx server errors
      
      if ((isQuotaError || isTransientError) && i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i) + Math.random() * 500; // Exponential backoff with jitter
        console.warn(`API call failed (attempt ${i + 1}/${maxRetries}). Retrying in ${delay.toFixed(0)}ms...`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error; // Rethrow if not a retriable error or max retries reached
      }
    }
  }
  throw new Error("Max retries exceeded for API call."); // Should not be reached if loop logic is correct
};

export const analyzeBook = async (book: Book): Promise<BookAnalysis> => {
  const modelsToTry = ['gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-flash'];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      
      const otherBooksContext = BOOKS_LIST
        .filter(b => b.id !== book.id)
        .map(b => `ID ${b.id}: ${b.titleVi} (${b.author})`)
        .join('\n');

      const prompt = `
        Bạn là một chuyên gia phân tích sách hàng đầu. Hãy phân tích tác phẩm sau:
        - Tên tiếng Anh: ${book.titleEn}
        - Tên tiếng Việt: ${book.titleVi}
        - Tác giả: ${book.author}
        - Năm xuất bản: ${book.year}

        Dưới đây là danh sách các tác phẩm khác trong thư viện:
        ${otherBooksContext}

        Vui lòng cung cấp thông tin chi tiết bằng TIẾNG VIỆT theo định dạng JSON chính xác với các trường sau:
        1. mainSummary: Tóm tắt nội dung chính.
        2. coreContents: Danh sách 10 nội dung cốt lõi.
        3. relevance2015_2025: Đánh giá sự phù hợp 2015-2025.
        4. forecast2025_2030: Dự báo 2025-2030.
        5. applicationVietnam: Áp dụng cho Việt Nam.
        6. chapterSummaries: Tóm tắt từng chương ({chapter: string, summary: string}).
        7. relatedSimilar: Mảng các đối tượng {id: number, reason: string} (tối đa 3) có quan điểm TƯƠNG ĐỒNG. Phần "reason" giải thích ngắn gọn tại sao tương đồng.
        8. relatedOpposing: Mảng các đối tượng {id: number, reason: string} (tối đa 3) có quan điểm ĐỐI LẬP. Phần "reason" giải thích ngắn gọn tại sao đối lập.
        9. recommendations: Mảng các đối tượng {id: number, reason: string} (tối đa 3) đề xuất cho người đọc tìm hiểu thêm dựa trên chủ đề hoặc phương pháp luận của tác phẩm này.
      `;

      const response = await retryWithBackoff(async () => {
        return await ai.models.generateContent({
          model,
          contents: [{ parts: [{ text: prompt }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                mainSummary: { type: Type.STRING },
                coreContents: { type: Type.ARRAY, items: { type: Type.STRING } },
                relevance2015_2025: { type: Type.STRING },
                forecast2025_2030: { type: Type.STRING },
                applicationVietnam: { type: Type.STRING },
                chapterSummaries: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      chapter: { type: Type.STRING },
                      summary: { type: Type.STRING }
                    },
                    required: ["chapter", "summary"]
                  }
                },
                relatedSimilar: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.INTEGER },
                      reason: { type: Type.STRING }
                    },
                    required: ["id", "reason"]
                  }
                },
                relatedOpposing: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.INTEGER },
                      reason: { type: Type.STRING }
                    },
                    required: ["id", "reason"]
                  }
                },
                recommendations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.INTEGER },
                      reason: { type: Type.STRING }
                    },
                    required: ["id", "reason"]
                  }
                }
              },
              required: ["mainSummary", "coreContents", "relevance2015_2025", "forecast2025_2030", "applicationVietnam", "chapterSummaries", "relatedSimilar", "relatedOpposing", "recommendations"]
            }
          }
        });
      }, MAX_RETRIES, BASE_DELAY_MS);

      const text = response.text;
      if (!text) throw new Error("Không nhận được phản hồi từ AI");
      
      return JSON.parse(text) as BookAnalysis;

    } catch (error: any) {
      lastError = error;
      const isQuotaError = error?.error?.code === 429 || error?.error?.status === 'RESOURCE_EXHAUSTED';
      if (isQuotaError && model === modelsToTry[modelsToTry.length - 1]) { // If the last model failed
         console.error(`Gemini Analysis Error: All models failed after retries for book ${book.id}.`, lastError);
         throw error;
      } else if (isQuotaError) { // If it's a quota error for a non-last model, try next.
        console.warn(`Model (${model}) quota exceeded after retries. Trying next model...`);
        // Continue to the next model in the loop
      } else {
        throw error; // Not a quota error, re-throw
      }
    }
  }
  // This line should ideally not be reached if the last model's error is re-thrown in the loop
  console.error("Gemini Analysis Error: Unexpected state where all models failed without re-throwing.", lastError);
  throw lastError || new Error("Failed to analyze book after multiple attempts with different models.");
};

export const startBookChat = (book: Book): Chat => {
  const modelsToTry = ['gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-flash'];
  let chatInstance: Chat | null = null;
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      chatInstance = ai.chats.create({
        model,
        config: {
          systemInstruction: `Bạn là một học giả uyên bác chuyên nghiên cứu về tác phẩm "${book.titleVi}" (${book.titleEn}) của tác giả ${book.author}. 
          Nhiệm vụ của bạn là giải đáp mọi thắc mắc của người dùng về nội dung, bối cảnh lịch sử, các triết lý trừu tượng và cách áp dụng thực tiễn của cuốn sách này. 
          Hãy trả lời bằng TIẾNG VIỆT, phong cách lịch sự, trí tuệ và sâu sắc.`,
        },
      });
      console.log(`Chat session started with model: ${model}`);
      return chatInstance; // Success
    } catch (error: any) {
      lastError = error;
      const isQuotaError = error?.error?.code === 429 || error?.error?.status === 'RESOURCE_EXHAUSTED';
      if (isQuotaError && model === modelsToTry[modelsToTry.length - 1]) { // If the last model failed
        console.error(`Failed to start chat session: All models failed.`, lastError);
        throw error;
      } else if (isQuotaError) { // If it's a quota error for a non-last model, try next.
        console.warn(`Chat model (${model}) quota exceeded. Trying next model...`);
        // Continue to the next model in the loop
      } else {
        console.error(`Failed to start chat session with model ${model}:`, error);
        throw error; // Not a quota error, re-throw
      }
    }
  }
  console.error("Failed to start chat session with any model after retries.", lastError);
  throw lastError || new Error("Failed to start chat session after multiple attempts.");
};

export const getDetailedChapterSummary = async (book: Book, chapterTitle: string): Promise<string> => {
  const modelsToTry = ['gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-flash'];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

      const prompt = `Hãy cung cấp một bản tóm tắt CHUYÊN SÂU và CHI TIẾT cho phần/chương mang tên "${chapterTitle}" trong tác phẩm "${book.titleVi}" (${book.titleEn}) của ${book.author}. 
      Phân tích các luận điểm chính và thông điệp mà tác giả muốn truyền tải. Trả lời bằng tiếng Việt.`;

      const response = await retryWithBackoff(async () => {
        return await ai.models.generateContent({
          model,
          contents: [{ parts: [{ text: prompt }] }],
        });
      }, MAX_RETRIES, BASE_DELAY_MS);
      
      return response.text || "Không thể lấy thông tin chi tiết vào lúc này.";

    } catch (error: any) {
      lastError = error;
      const isQuotaError = error?.error?.code === 429 || error?.error?.status === 'RESOURCE_EXHAUSTED';
      if (isQuotaError && model === modelsToTry[modelsToTry.length - 1]) { // If the last model failed
        console.error(`Detailed Chapter Summary Error: All models failed after retries for chapter ${chapterTitle}.`, lastError);
        throw error;
      } else if (isQuotaError) { // If it's a quota error for a non-last model, try next.
        console.warn(`Model (${model}) quota exceeded after retries. Trying next model for chapter summary...`);
        // Continue to the next model in the loop
      } else {
        throw error; // Not a quota error, re-throw
      }
    }
  }
  console.error("Detailed Chapter Summary Error: Unexpected state where all models failed without re-throwing.", lastError);
  throw lastError || new Error("Failed to get detailed chapter summary after multiple attempts with different models.");
};
