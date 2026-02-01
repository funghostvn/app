
import { GoogleGenAI, Type, Chat } from "@google/genai";
import { Book, BookAnalysis } from "../types";
import { BOOKS_LIST } from "../constants";

export const analyzeBook = async (book: Book): Promise<BookAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const model = 'gemini-3-flash-preview';
  
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

  try {
    const response = await ai.models.generateContent({
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

    const text = response.text;
    if (!text) throw new Error("Không nhận được phản hồi từ AI");
    
    return JSON.parse(text) as BookAnalysis;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};

export const startBookChat = (book: Book): Chat => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: `Bạn là một học giả uyên bác chuyên nghiên cứu về tác phẩm "${book.titleVi}" (${book.titleEn}) của tác giả ${book.author}. 
      Nhiệm vụ của bạn là giải đáp mọi thắc mắc của người dùng về nội dung, bối cảnh lịch sử, các triết lý trừu tượng và cách áp dụng thực tiễn của cuốn sách này. 
      Hãy trả lời bằng TIẾNG VIỆT, phong cách lịch sự, trí tuệ và sâu sắc.`,
    },
  });
};

export const getDetailedChapterSummary = async (book: Book, chapterTitle: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const model = 'gemini-3-flash-preview';

  const prompt = `Hãy cung cấp một bản tóm tắt CHUYÊN SÂU và CHI TIẾT cho phần/chương mang tên "${chapterTitle}" trong tác phẩm "${book.titleVi}" (${book.titleEn}) của ${book.author}. 
  Phân tích các luận điểm chính và thông điệp mà tác giả muốn truyền tải. Trả lời bằng tiếng Việt.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
    });
    return response.text || "Không thể lấy thông tin chi tiết vào lúc này.";
  } catch (error) {
    console.error("Detailed Chapter Summary Error:", error);
    throw error;
  }
};
