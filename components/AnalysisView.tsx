
import React, { useState, useEffect, useRef } from 'react';
import { Book, BookAnalysis, RelatedBook } from '../types';
import { startBookChat, getDetailedChapterSummary } from '../services/geminiService';
import { Chat } from '@google/genai';
import { BOOKS_LIST } from '../constants';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface AnalysisViewProps {
  book: Book;
  analysis: BookAnalysis;
  onClose: () => void;
  onNavigateToBook?: (bookId: number) => void;
}

const AnalysisView: React.FC<AnalysisViewProps> = ({ book, analysis, onClose, onNavigateToBook }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: `Xin chào! Tôi là trợ lý AI chuyên sâu về tác phẩm "${book.titleVi}". Bạn có câu hỏi nào về nội dung hoặc cách áp dụng kiến thức từ cuốn sách này không?` }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showMorePoints, setShowMorePoints] = useState(false);
  
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());
  const [detailedChapters, setDetailedChapters] = useState<Record<number, string>>({});
  const [loadingChapter, setLoadingChapter] = useState<number | null>(null);
  const [isBatchLoading, setIsBatchLoading] = useState(false);

  const chatInstance = useRef<Chat | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatInstance.current = startBookChat(book);
  }, [book]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, showChat]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isTyping) return;

    const userMessage = inputValue.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setInputValue('');
    setIsTyping(true);

    try {
      if (!chatInstance.current) {
        chatInstance.current = startBookChat(book);
      }
      
      const response = await chatInstance.current.sendMessage({ message: userMessage });
      const aiText = response.text || "Tôi xin lỗi, có lỗi xảy ra khi xử lý phản hồi.";
      setMessages(prev => [...prev, { role: 'model', text: aiText }]);
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, { role: 'model', text: "Rất tiếc, kết nối AI bị gián đoạn. Vui lòng thử lại sau giây lát." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleChapterClick = async (index: number, chapterTitle: string) => {
    const newExpanded = new Set(expandedChapters);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
      setExpandedChapters(newExpanded);
      return;
    }

    if (detailedChapters[index]) {
      newExpanded.add(index);
      setExpandedChapters(newExpanded);
      return;
    }

    setLoadingChapter(index);
    try {
      const detail = await getDetailedChapterSummary(book, chapterTitle);
      setDetailedChapters(prev => ({ ...prev, [index]: detail }));
      newExpanded.add(index);
      setExpandedChapters(newExpanded);
    } catch (err) {
      console.error("Failed to fetch chapter detail", err);
    } finally {
      setLoadingChapter(null);
    }
  };

  const handleExpandAll = async () => {
    const allIndices = analysis.chapterSummaries.map((_, i) => i);
    setExpandedChapters(new Set(allIndices));

    const missingIndices = allIndices.filter(idx => !detailedChapters[idx]);
    
    if (missingIndices.length === 0) return;

    setIsBatchLoading(true);
    for (const idx of missingIndices) {
      try {
        setLoadingChapter(idx);
        const detail = await getDetailedChapterSummary(book, analysis.chapterSummaries[idx].chapter);
        setDetailedChapters(prev => ({ ...prev, [idx]: detail }));
      } catch (err) {
        console.error(`Failed to fetch detail for chapter ${idx}`, err);
      }
    }
    setLoadingChapter(null);
    setIsBatchLoading(false);
  };

  const handleCollapseAll = () => {
    setExpandedChapters(new Set());
  };

  const renderRelatedBookItem = (item: RelatedBook, type: 'similar' | 'opposing' | 'recommendation') => {
    const relatedBook = BOOKS_LIST.find(b => b.id === item.id);
    if (!relatedBook) return null;

    let badgeClass = '';
    let badgeText = '';
    let cardClass = '';
    let reasonClass = '';

    switch(type) {
      case 'similar':
        badgeClass = 'bg-emerald-100 text-emerald-700';
        badgeText = 'Tương đồng';
        cardClass = 'bg-white border-emerald-100 hover:border-emerald-300';
        reasonClass = 'bg-emerald-50/50 border-emerald-400 text-emerald-800';
        break;
      case 'opposing':
        badgeClass = 'bg-orange-100 text-orange-700';
        badgeText = 'Đối lập';
        cardClass = 'bg-white border-orange-100 hover:border-orange-300';
        reasonClass = 'bg-orange-50/50 border-orange-400 text-orange-800';
        break;
      case 'recommendation':
        badgeClass = 'bg-indigo-100 text-indigo-700';
        badgeText = 'Gợi ý';
        cardClass = 'bg-white border-indigo-100 hover:border-indigo-300';
        reasonClass = 'bg-indigo-50/50 border-indigo-400 text-indigo-800';
        break;
    }

    return (
      <div key={item.id} className="group flex flex-col gap-2">
        <button
          onClick={() => onNavigateToBook?.(item.id)}
          className={`flex flex-col items-start p-4 rounded-2xl border transition-all text-left hover:scale-[1.02] active:scale-95 shadow-sm ${cardClass}`}
        >
          <div className="flex items-center gap-2 mb-1.5">
             <span className={`text-[9px] font-black uppercase tracking-tighter px-2 py-0.5 rounded ${badgeClass}`}>
              {badgeText}
            </span>
            <span className="text-[10px] text-slate-400 font-bold">ID #{relatedBook.id}</span>
          </div>
          <h5 className="text-sm font-black text-slate-900 line-clamp-1">{relatedBook.titleVi}</h5>
          <p className="text-[10px] text-slate-500 font-bold">{relatedBook.author}</p>
        </button>
        {item.reason && (
          <div className={`px-4 py-3 rounded-2xl border-l-4 text-[11px] leading-relaxed font-medium italic ${reasonClass}`}>
            {item.reason}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-0 md:p-6">
      <div className="bg-white w-full max-w-7xl h-full md:h-[90vh] md:rounded-[40px] shadow-2xl flex flex-col md:flex-row overflow-hidden relative">
        
        <div className={`flex-1 flex flex-col h-full transition-all duration-500 ${showChat ? 'md:mr-[400px]' : ''}`}>
          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white z-20">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-md uppercase tracking-wider">Tác phẩm #{book.id}</span>
                <span className="text-slate-300">•</span>
                <span className="text-xs font-bold text-slate-400">{book.category}</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">{book.titleVi}</h2>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowChat(!showChat)}
                className={`hidden md:flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black transition-all border ${
                  showChat 
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/30' 
                  : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-500 hover:text-indigo-600'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                {showChat ? 'ĐÓNG CHAT AI' : 'HỎI ĐÁP CHUYÊN SÂU'}
              </button>
              <button 
                onClick={onClose}
                className="p-3 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-2xl transition-all active:scale-90"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-12">
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-sm font-black text-indigo-500 uppercase tracking-[0.3em] mb-4 flex items-center gap-3">
                <span className="w-8 h-[2px] bg-indigo-500"></span>
                Tóm tắt nội dung chính
              </h3>
              <p className="text-slate-600 text-lg leading-relaxed font-medium text-justify">
                {analysis.mainSummary}
              </p>

              {/* Luận điểm chính Subsection */}
              <div className="mt-8 pt-8 border-t border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-4 bg-indigo-500 rounded-full"></span>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Luận điểm chính</h4>
                  </div>
                  <button 
                    onClick={() => setShowMorePoints(!showMorePoints)}
                    className="flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-600 hover:text-white transition-all shadow-sm active:scale-95"
                  >
                    {showMorePoints ? 'Thu gọn' : 'Xem thêm luận điểm'}
                    <svg className={`w-3 h-3 transition-transform ${showMorePoints ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                <div className="p-6 bg-slate-50/50 rounded-2xl border border-slate-100 mb-4 hover:bg-white hover:shadow-md transition-all duration-300">
                  <div className="flex gap-4">
                    <span className="flex-shrink-0 w-8 h-8 rounded-xl bg-white text-indigo-600 flex items-center justify-center font-black shadow-sm">1</span>
                    <p className="text-slate-800 text-md font-bold leading-relaxed pt-1">
                      {analysis.coreContents[0]}
                    </p>
                  </div>
                </div>
                
                {showMorePoints && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in zoom-in-95 duration-300">
                    {analysis.coreContents.slice(1).map((point, idx) => (
                      <div key={idx} className="flex gap-4 p-5 bg-indigo-50/20 rounded-2xl border border-indigo-100/50 hover:bg-white hover:shadow-sm transition-all">
                        <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-white text-indigo-500 flex items-center justify-center text-[11px] font-black shadow-sm">{idx + 2}</span>
                        <span className="text-slate-600 text-sm font-semibold leading-snug">{point}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {(analysis.relatedSimilar?.length > 0 || analysis.relatedOpposing?.length > 0) && (
              <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col gap-1 mb-6">
                   <h3 className="text-sm font-black text-indigo-500 uppercase tracking-[0.3em] flex items-center gap-3">
                    <span className="w-8 h-[2px] bg-indigo-500"></span>
                    Góc nhìn đa chiều & So sánh
                  </h3>
                  <p className="text-[11px] text-slate-400 font-bold ml-11 uppercase tracking-tighter">Phân tích mối liên hệ với các tác phẩm khác trong hệ thống</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {analysis.relatedSimilar?.length > 0 && (
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2 pl-1">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/></svg>
                        Quan điểm bổ trợ & Tương đồng
                      </p>
                      <div className="flex flex-col gap-5">
                        {analysis.relatedSimilar.map(item => renderRelatedBookItem(item, 'similar'))}
                      </div>
                    </div>
                  )}
                  {analysis.relatedOpposing?.length > 0 && (
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest flex items-center gap-2 pl-1">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"/></svg>
                        Quan điểm phản biện & Đối lập
                      </p>
                      <div className="flex flex-col gap-5">
                        {analysis.relatedOpposing.map(item => renderRelatedBookItem(item, 'opposing'))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {analysis.recommendations?.length > 0 && (
              <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col gap-1 mb-6">
                   <h3 className="text-sm font-black text-indigo-500 uppercase tracking-[0.3em] flex items-center gap-3">
                    <span className="w-8 h-[2px] bg-indigo-500"></span>
                    Gợi ý thêm sách dựa trên phân tích này
                  </h3>
                  <p className="text-[11px] text-slate-400 font-bold ml-11 uppercase tracking-tighter">Những tác phẩm nên đọc tiếp theo để mở rộng kiến thức</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {analysis.recommendations.map(item => renderRelatedBookItem(item, 'recommendation'))}
                </div>
              </section>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <section className="bg-slate-900 text-white p-8 rounded-[32px] shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-4">Sự phù hợp 2015-2025</h3>
                <p className="text-sm text-slate-300 leading-relaxed font-medium">{analysis.relevance2015_2025}</p>
              </section>
              <section className="bg-emerald-600 text-white p-8 rounded-[32px] shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-200 mb-4">Dự báo 2025-2030</h3>
                <p className="text-sm text-emerald-50 leading-relaxed font-medium">{analysis.forecast2025_2030}</p>
              </section>
            </div>

            <section className="bg-gradient-to-br from-indigo-50 to-white p-8 rounded-[40px] border border-indigo-100 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-400">
              <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500 flex items-center justify-center text-white">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                  </svg>
                </div>
                Áp dụng thực tiễn cho Việt Nam
              </h3>
              <p className="text-slate-600 text-md leading-relaxed font-semibold pl-1">
                {analysis.applicationVietnam}
              </p>
            </section>

            <section className="pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-500">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-black text-indigo-500 uppercase tracking-[0.3em] flex items-center gap-3">
                    <span className="w-8 h-[2px] bg-indigo-500"></span>
                    Tóm tắt cấu trúc tác phẩm
                  </h3>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic ml-11">Click vào chương để xem chi tiết</span>
                </div>
                <div className="flex items-center gap-2">
                   <button 
                    onClick={handleExpandAll}
                    disabled={isBatchLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all disabled:opacity-50"
                  >
                    {isBatchLoading ? 'Đang tải...' : 'Mở rộng tất cả'}
                  </button>
                  <button 
                    onClick={handleCollapseAll}
                    className="px-4 py-2 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                  >
                    Thu gọn tất cả
                  </button>
                </div>
              </div>
              <div className="space-y-6">
                {analysis.chapterSummaries.map((ch, idx) => (
                  <div 
                    key={idx} 
                    className={`group relative pl-8 cursor-pointer transition-all duration-300 before:content-[''] before:absolute before:left-0 before:top-0 before:w-1 before:h-full before:bg-slate-100 before:rounded-full hover:before:bg-indigo-400 ${expandedChapters.has(idx) ? 'before:bg-indigo-600' : ''}`}
                    onClick={() => handleChapterClick(idx, ch.chapter)}
                  >
                    <div className="flex items-center justify-between">
                      <h4 className={`font-black text-sm mb-2 transition-colors ${expandedChapters.has(idx) ? 'text-indigo-600' : 'text-slate-800 group-hover:text-indigo-500'}`}>{ch.chapter}</h4>
                      {loadingChapter === idx && (
                        <svg className="animate-spin h-4 w-4 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                    </div>
                    <p className="text-slate-500 text-sm leading-relaxed">{ch.summary}</p>
                    
                    {expandedChapters.has(idx) && detailedChapters[idx] && (
                      <div className="mt-4 p-8 bg-indigo-50 rounded-2xl border border-indigo-200 shadow-sm animate-in zoom-in-95 duration-300 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-200 opacity-50"></div>
                        <div className="flex items-start gap-3 mb-4">
                           <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                              </svg>
                           </div>
                           <div>
                              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-0.5">Phân tích chi tiết bởi AI</p>
                              <p className="text-xs font-bold text-indigo-400">Deep Chapter Analysis</p>
                           </div>
                        </div>
                        <div className="text-slate-700 text-base leading-loose font-medium whitespace-pre-wrap chapter-detail-content">
                          {detailedChapters[idx]}
                        </div>
                        <div className="mt-8 pt-6 border-t border-indigo-100 flex items-center justify-between">
                           <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest italic">Kết thúc phần tóm tắt chi tiết</p>
                           <button 
                            onClick={(e) => { e.stopPropagation(); handleChapterClick(idx, ch.chapter); }}
                            className="text-[10px] font-black text-indigo-500 uppercase hover:text-indigo-700 transition-colors"
                           >
                            Thu gọn nội dung
                           </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className={`absolute top-0 right-0 h-full bg-slate-50 border-l border-slate-200 z-40 w-full md:w-[400px] transform transition-transform duration-500 ease-in-out ${showChat ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex flex-col h-full">
            <div className="px-6 py-5 bg-white border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-xs uppercase tracking-widest">Chat chuyên sâu</h4>
                  <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-tighter">AI Scholar Online</p>
                </div>
              </div>
              <button 
                onClick={() => setShowChat(false)}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                  <div className={`max-w-[85%] px-5 py-4 rounded-3xl text-sm font-medium leading-relaxed shadow-sm ${
                    msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-br-none' 
                    : 'bg-white text-slate-700 border border-slate-100 rounded-bl-none'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start animate-pulse">
                  <div className="bg-slate-200 px-4 py-3 rounded-2xl rounded-bl-none flex gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-100"></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-200"></span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 bg-white border-t border-slate-100">
              <form onSubmit={handleSendMessage} className="relative">
                <input 
                  type="text"
                  placeholder="Hỏi AI về cuốn sách này..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-5 pr-14 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium placeholder:text-slate-400"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  disabled={isTyping}
                />
                <button 
                  type="submit"
                  disabled={!inputValue.trim() || isTyping}
                  className="absolute right-2 top-2 w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 transition-all disabled:opacity-50 active:scale-90"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>
              <p className="text-[9px] text-center text-slate-400 font-bold uppercase mt-4 tracking-widest">Dữ liệu được xử lý bởi Gemini AI</p>
            </div>
          </div>
        </div>

        <button 
          onClick={() => setShowChat(!showChat)}
          className="md:hidden fixed bottom-6 right-6 z-50 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center transition-transform active:scale-90"
        >
          {showChat ? (
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
             </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          )}
        </button>

      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
        .chapter-detail-content p {
          margin-bottom: 1.5rem;
        }
        .chapter-detail-content ul, .chapter-detail-content ol {
          margin-bottom: 1.5rem;
          padding-left: 1.5rem;
        }
        .chapter-detail-content li {
          margin-bottom: 0.5rem;
        }
      `}</style>
    </div>
  );
};

export default AnalysisView;
