
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
  const contentAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatInstance.current = startBookChat(book);
    
    // Reset states when book changes
    setExpandedChapters(new Set());
    setDetailedChapters({});
    setMessages([{ role: 'model', text: `Xin chào! Tôi là trợ lý AI chuyên sâu về tác phẩm "${book.titleVi}". Bạn có câu hỏi nào về nội dung hoặc cách áp dụng kiến thức từ cuốn sách này không?` }]);
    setShowMorePoints(false);

    // Scroll to top when book changes
    if (contentAreaRef.current) {
      contentAreaRef.current.scrollTop = 0;
    }
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

  /**
   * Refined Inline formatting: bold, italics, code
   */
  const parseInlines = (text: string) => {
    if (!text) return null;
    const regex = /(\*\*.*?\*\*|\*.*?\*|_.*?_|`.*?`)/g;
    const parts = text.split(regex);

    return parts.map((part, i) => {
      if (!part) return null;
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-slate-950 font-black decoration-indigo-200 underline decoration-2 underline-offset-4">{part.slice(2, -2)}</strong>;
      }
      if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
        return <em key={i} className="italic font-bold text-slate-800">{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i} className="bg-slate-100 text-indigo-700 px-2 py-0.5 rounded-lg font-mono text-[0.85em] border border-slate-200 shadow-sm">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  /**
   * Optimized Markdown Parser with Strict Block Spacing & Hierarchy
   */
  const formatMarkdown = (text: string): React.ReactNode[] => {
    if (!text) return [];
    
    // Pre-processing
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const lines = cleanText.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    const blockSpacing = "mb-8 last:mb-0"; // Consistent bottom margin

    while (i < lines.length) {
      const rawLine = lines[i];
      const trimmedLine = rawLine.trim();

      if (!trimmedLine) {
        i++;
        continue;
      }

      // 1. Code Blocks
      if (trimmedLine.startsWith('```')) {
        const langMatch = trimmedLine.match(/^```(\w*)/);
        const language = langMatch ? langMatch[1] : '';
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        elements.push(
          <div key={`code-blk-${i}`} className={`my-12 overflow-hidden rounded-[40px] border border-slate-200 shadow-2xl bg-[#0d1117] ${blockSpacing}`}>
            <div className="flex items-center justify-between px-8 py-4 bg-[#161b22] border-b border-white/5">
              <div className="flex items-center gap-3">
                 <div className="flex gap-1.5 mr-4">
                    <div className="w-3 h-3 rounded-full bg-red-400/20 border border-red-400/40"></div>
                    <div className="w-3 h-3 rounded-full bg-amber-400/20 border border-amber-400/40"></div>
                    <div className="w-3 h-3 rounded-full bg-emerald-400/20 border border-emerald-400/40"></div>
                 </div>
                 <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{language || 'terminal'}</span>
              </div>
            </div>
            <pre className="p-10 overflow-x-auto font-mono text-[13px] leading-relaxed text-indigo-200 custom-scrollbar-dark">
              <code>{codeLines.join('\n')}</code>
            </pre>
          </div>
        );
        i++; 
        continue;
      }

      // 2. Enhanced Blockquotes
      if (trimmedLine.startsWith('>')) {
        const quoteLines: string[] = [];
        while (i < lines.length && (lines[i].trim().startsWith('>') || (lines[i].trim() === '' && i + 1 < lines.length && lines[i+1].trim().startsWith('>')))) {
          const l = lines[i].trim();
          if (l.startsWith('>')) quoteLines.push(l.substring(1).trim());
          else if (l === '') quoteLines.push('');
          i++;
        }
        elements.push(
          <blockquote key={`quote-${i}`} className={`relative my-12 p-10 bg-gradient-to-br from-indigo-50/60 to-white rounded-[48px] border-l-[8px] border-indigo-500 shadow-lg shadow-indigo-100/50 ${blockSpacing}`}>
            <div className="absolute top-6 left-4 text-indigo-400/20 scale-[2] pointer-events-none">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M14.017 21L14.017 18C14.017 16.8954 14.9124 16 16.017 16H19.017C19.5693 16 20.017 15.5523 20.017 15V9C20.017 8.44772 19.5693 8 19.017 8H16.017C14.9124 8 14.017 7.10457 14.017 6V3L21.017 3V15C21.017 18.3137 18.3307 21 15.017 21H14.017ZM3.0166 21L3.0166 18C3.0166 16.8954 3.91203 16 5.0166 16H8.0166C8.56888 16 9.0166 15.5523 9.0166 15V9C9.0166 8.44772 8.56888 8 8.0166 8H5.0166C3.91203 8 3.0166 7.10457 3.0166 6V3L10.0166 3V15C10.0166 18.3137 7.3303 21 4.0166 21H3.0166Z" /></svg>
            </div>
            {quoteLines.map((l, idx) => (
              <p key={idx} className={`text-slate-800 font-bold text-xl leading-relaxed italic relative z-10 ${l === '' ? 'h-6' : idx > 0 ? 'mt-4' : ''}`}>
                {parseInlines(l)}
              </p>
            ))}
          </blockquote>
        );
        continue;
      }

      // 3. Structured Headers
      if (trimmedLine.startsWith('### ')) {
        elements.push(
          <h4 key={`h4-${i}`} className="flex items-center gap-4 text-2xl font-black text-slate-900 mt-16 mb-8 px-2">
            <div className="w-2.5 h-8 bg-indigo-500 rounded-full shadow-lg shadow-indigo-200"></div>
            {parseInlines(trimmedLine.substring(4))}
          </h4>
        );
        i++; continue;
      }
      if (trimmedLine.startsWith('## ')) {
        elements.push(
          <h3 key={`h3-${i}`} className="text-3xl font-black text-slate-900 border-b-4 border-slate-100 pb-6 mt-20 mb-10 tracking-tight">
            {parseInlines(trimmedLine.substring(3))}
          </h3>
        );
        i++; continue;
      }
      if (trimmedLine.startsWith('# ')) {
        elements.push(
          <h2 key={`h2-${i}`} className="text-4xl font-black text-slate-950 mt-24 mb-12 tracking-tighter">
            {parseInlines(trimmedLine.substring(2))}
          </h2>
        );
        i++; continue;
      }

      // 4. Stylish Horizontal Rules
      if (trimmedLine === '---' || trimmedLine === '***') {
        elements.push(
          <div key={`hr-${i}`} className="my-20 flex items-center gap-6 px-10 opacity-40">
            <div className="flex-1 h-px bg-slate-300"></div>
            <div className="w-2.5 h-2.5 rotate-45 border-2 border-slate-400"></div>
            <div className="flex-1 h-px bg-slate-300"></div>
          </div>
        );
        i++; continue;
      }

      // 5. Precise Lists with Spacing
      const listMatch = rawLine.match(/^(\s*)([-*•]|\d+\.)\s+(.*)/);
      if (listMatch) {
        const listItems: React.ReactNode[] = [];
        let j = i;
        while (j < lines.length) {
          const m = lines[j].match(/^(\s*)([-*•]|\d+\.)\s+(.*)/);
          if (!m) {
             if (lines[j].trim() === '' && j + 1 < lines.length && lines[j+1].match(/^(\s*)([-*•]|\d+\.)\s+(.*)/)) { j++; continue; }
             break;
          }
          const indentLevel = m[1].length;
          const isNumeric = /^\d+\./.test(m[2]);
          listItems.push(
            <li key={`li-${j}`} className="relative mb-6 last:mb-0 group" style={{ marginLeft: `${indentLevel * 0.8}rem` }}>
              <div className="absolute left-0 top-3 w-10 h-10 -translate-x-full flex items-center justify-center">
                 {isNumeric ? (
                   <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-xl shadow-sm border border-indigo-100">
                     {m[2]}
                   </span>
                 ) : (
                   <div className={`w-3 h-3 rounded-full ${indentLevel > 0 ? 'bg-slate-300' : 'bg-indigo-500'} shadow-md group-hover:scale-125 transition-transform duration-500`}></div>
                 )}
              </div>
              <div className="text-slate-800 font-bold text-lg md:text-xl leading-[1.8] pl-6">
                {parseInlines(m[3])}
              </div>
            </li>
          );
          j++;
        }
        elements.push(<ul key={`ul-${i}`} className={`my-10 space-y-4 list-none ml-14 ${blockSpacing}`}>{listItems}</ul>);
        i = j; continue;
      }

      // 6. Clean Paragraphs
      elements.push(
        <p key={`p-${i}`} className={`leading-[1.9] text-slate-700 font-bold text-lg md:text-xl text-justify opacity-95 ${blockSpacing}`}>
          {parseInlines(trimmedLine)}
        </p>
      );
      i++;
    }
    
    return elements;
  };

  const renderRelatedBookItem = (item: RelatedBook, type: 'similar' | 'opposing' | 'recommendation') => {
    const relatedBook = BOOKS_LIST.find(b => b.id === item.id);
    if (!relatedBook) return null;

    let badgeClass = '';
    let badgeText = '';
    let cardClass = '';
    let reasonContainerClass = '';
    let reasonLabel = '';
    let Icon: React.ReactNode = null;

    switch(type) {
      case 'similar':
        badgeClass = 'bg-emerald-100 text-emerald-700 border-emerald-200';
        badgeText = 'Tương đồng';
        cardClass = 'bg-white border-emerald-100 hover:border-emerald-300 hover:shadow-emerald-100';
        reasonContainerClass = 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-sm';
        reasonLabel = 'Phân tích tương đồng:';
        Icon = (
          <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
        break;
      case 'opposing':
        badgeClass = 'bg-orange-100 text-orange-700 border-orange-200';
        badgeText = 'Đối lập';
        cardClass = 'bg-white border-orange-100 hover:border-orange-300 hover:shadow-orange-100';
        reasonContainerClass = 'bg-orange-50 border-orange-500 text-orange-900 shadow-sm';
        reasonLabel = 'Phân tích đối lập:';
        Icon = (
          <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
        break;
      case 'recommendation':
        badgeClass = 'bg-indigo-100 text-indigo-700 border-indigo-200';
        badgeText = 'Gợi ý đọc thêm';
        cardClass = 'bg-white border-indigo-100 hover:border-indigo-300 hover:shadow-indigo-100';
        reasonContainerClass = 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-sm';
        reasonLabel = 'Tại sao nên đọc:';
        Icon = (
          <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
        break;
    }

    return (
      <div key={item.id} className="group flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <button
          onClick={() => onNavigateToBook?.(item.id)}
          className={`flex flex-col items-start p-7 rounded-[40px] border-2 transition-all text-left hover:scale-[1.03] active:scale-95 shadow-sm hover:shadow-2xl ${cardClass}`}
        >
          <div className="flex items-center gap-3 mb-4">
             <span className={`text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border ${badgeClass}`}>
              {badgeText}
            </span>
            <span className="text-[11px] text-slate-400 font-black bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 shadow-inner">BOOK ID #{relatedBook.id}</span>
          </div>
          <h5 className="text-xl font-black text-slate-950 line-clamp-2 leading-tight mb-3 group-hover:text-indigo-600 transition-colors">{relatedBook.titleVi}</h5>
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-black text-xs">
                {relatedBook.author.charAt(0)}
             </div>
             <p className="text-[11px] text-slate-600 font-black uppercase tracking-widest">{relatedBook.author}</p>
          </div>
        </button>
        
        {item.reason && (
          <div className={`relative px-8 py-7 rounded-[32px] border-l-[8px] text-base leading-relaxed font-bold ${reasonContainerClass}`}>
            <div className="flex items-center gap-3 mb-4">
               <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shrink-0 shadow-sm">
                  {Icon}
               </div>
               <span className="text-[11px] font-black uppercase tracking-[0.2em] opacity-60">{reasonLabel}</span>
            </div>
            <p className="pl-1 italic text-slate-800 opacity-95">{item.reason}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-0 md:p-6">
      <div className="bg-white w-full max-w-7xl h-full md:h-[90vh] md:rounded-[48px] shadow-2xl flex flex-col md:flex-row overflow-hidden relative border border-white/20">
        
        <div className={`flex-1 flex flex-col h-full transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${showChat ? 'md:mr-[400px]' : ''}`}>
          <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-white z-20">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-xl uppercase tracking-widest">Tác phẩm #{book.id}</span>
                <span className="text-slate-300">•</span>
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{book.category}</span>
              </div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-none">{book.titleVi}</h2>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setShowChat(!showChat)}
                className={`hidden md:flex items-center gap-2 px-6 py-3.5 rounded-2xl text-[11px] font-black transition-all border shadow-sm ${
                  showChat 
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-indigo-500/30' 
                  : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-500 hover:text-indigo-600 hover:shadow-md'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                {showChat ? 'ĐÓNG CHAT AI' : 'HỎI ĐÁP CHUYÊN SÂU'}
              </button>
              <button 
                onClick={onClose}
                className="p-4 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-[20px] transition-all active:scale-90"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div ref={contentAreaRef} className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-24">
            <section className="animate-in fade-in slide-in-from-bottom-6 duration-700">
              <h3 className="text-[11px] font-black text-indigo-500 uppercase tracking-[0.4em] mb-8 flex items-center gap-4">
                <span className="w-12 h-0.5 bg-indigo-500"></span>
                Tóm tắt nội dung chính
              </h3>
              <p className="text-slate-700 text-2xl leading-[1.8] font-bold text-justify">
                {analysis.mainSummary}
              </p>

              {/* Core Points Subsection */}
              <div className="mt-16 pt-16 border-t border-slate-100">
                <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-10 bg-indigo-500 rounded-full shadow-lg shadow-indigo-200"></div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">Hệ thống luận điểm cốt lõi</h4>
                  </div>
                  <button 
                    onClick={() => setShowMorePoints(!showMorePoints)}
                    className="flex items-center gap-3 text-[11px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-6 py-3 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all shadow-md active:scale-95"
                  >
                    {showMorePoints ? 'Thu gọn' : 'Giải mã luận điểm'}
                    <svg className={`w-4 h-4 transition-transform ${showMorePoints ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                <div className="p-10 bg-slate-50/50 rounded-[48px] border-2 border-slate-100 mb-8 hover:bg-white hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-700 group">
                  <div className="flex gap-8">
                    <span className="flex-shrink-0 w-14 h-14 rounded-3xl bg-indigo-600 text-white flex items-center justify-center text-xl font-black shadow-2xl shadow-indigo-200 group-hover:scale-110 group-hover:rotate-6 transition-all">1</span>
                    <p className="text-slate-950 text-xl font-black leading-relaxed pt-3">
                      {analysis.coreContents[0]}
                    </p>
                  </div>
                </div>
                
                {showMorePoints && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in zoom-in-95 duration-700">
                    {analysis.coreContents.slice(1).map((point, idx) => (
                      <div key={idx} className="flex gap-6 p-10 bg-white rounded-[40px] border border-slate-100 hover:border-indigo-200 hover:shadow-2xl hover:shadow-indigo-100/30 transition-all group">
                        <span className="flex-shrink-0 w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-[11px] font-black border border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white transition-all">{idx + 2}</span>
                        <span className="text-slate-800 text-lg font-bold leading-relaxed">{point}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {(analysis.relatedSimilar?.length > 0 || analysis.relatedOpposing?.length > 0) && (
              <section className="animate-in fade-in slide-in-from-bottom-6 duration-700">
                <div className="flex flex-col gap-3 mb-12">
                   <h3 className="text-[11px] font-black text-indigo-500 uppercase tracking-[0.4em] flex items-center gap-4">
                    <span className="w-12 h-0.5 bg-indigo-500"></span>
                    Ma trận tri thức đa chiều
                  </h3>
                  <p className="text-[11px] text-slate-400 font-black ml-[64px] uppercase tracking-widest italic opacity-70">Khám phá các điểm chạm tư duy giữa các tác phẩm</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-20">
                  {analysis.relatedSimilar?.length > 0 && (
                    <div className="space-y-12">
                      <p className="text-[11px] font-black text-emerald-600 uppercase tracking-[0.4em] flex items-center gap-4 pl-4 border-l-4 border-emerald-500">
                        Hệ tư tưởng bổ trợ & Liên kết
                      </p>
                      <div className="flex flex-col gap-16">
                        {analysis.relatedSimilar.map(item => renderRelatedBookItem(item, 'similar'))}
                      </div>
                    </div>
                  )}
                  {analysis.relatedOpposing?.length > 0 && (
                    <div className="space-y-12">
                      <p className="text-[11px] font-black text-orange-600 uppercase tracking-[0.4em] flex items-center gap-4 pl-4 border-l-4 border-orange-500">
                        Đối lập quan điểm & Phản biện
                      </p>
                      <div className="flex flex-col gap-16">
                        {analysis.relatedOpposing.map(item => renderRelatedBookItem(item, 'opposing'))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {analysis.recommendations?.length > 0 && (
              <section className="animate-in fade-in slide-in-from-bottom-6 duration-700">
                <div className="flex flex-col gap-3 mb-12">
                   <h3 className="text-[11px] font-black text-indigo-500 uppercase tracking-[0.4em] flex items-center gap-4">
                    <span className="w-12 h-0.5 bg-indigo-500"></span>
                    Lộ trình nghiên cứu tiếp nối
                  </h3>
                  <p className="text-[11px] text-slate-400 font-black ml-[64px] uppercase tracking-widest italic opacity-70">Đề xuất dựa trên hệ sinh thái tri thức của tác giả</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-12">
                  {analysis.recommendations.map(item => renderRelatedBookItem(item, 'recommendation'))}
                </div>
              </section>
            )}

            <section className="pb-32 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-500">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-16 gap-8">
                <div className="flex flex-col gap-3">
                  <h3 className="text-[11px] font-black text-indigo-500 uppercase tracking-[0.4em] flex items-center gap-4">
                    <span className="w-12 h-0.5 bg-indigo-500"></span>
                    Giải phẫu cấu trúc nội hàm
                  </h3>
                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest italic ml-[64px] opacity-70">Nghiên cứu chi tiết từng chương mục thông qua lăng kính AI</span>
                </div>
                <div className="flex items-center gap-4">
                   <button 
                    onClick={handleExpandAll}
                    disabled={isBatchLoading}
                    className="flex items-center gap-3 px-8 py-4 bg-indigo-600 text-white rounded-[24px] text-[11px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-xl shadow-indigo-200"
                  >
                    {isBatchLoading ? 'AI ĐANG GIẢI MÃ...' : 'KHAI PHÁ TOÀN BỘ'}
                  </button>
                  <button 
                    onClick={handleCollapseAll}
                    className="px-8 py-4 bg-slate-100 text-slate-500 rounded-[24px] text-[11px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all border border-slate-200"
                  >
                    THU GỌN
                  </button>
                </div>
              </div>
              <div className="space-y-12">
                {analysis.chapterSummaries.map((ch, idx) => (
                  <div 
                    key={idx} 
                    className={`group relative pl-12 cursor-pointer transition-all duration-700 before:content-[''] before:absolute before:left-0 before:top-0 before:w-2 before:h-full before:bg-slate-100 before:rounded-full hover:before:bg-indigo-300 ${expandedChapters.has(idx) ? 'before:bg-indigo-600' : ''}`}
                    onClick={() => handleChapterClick(idx, ch.chapter)}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h4 className={`font-black text-xl transition-colors duration-500 ${expandedChapters.has(idx) ? 'text-indigo-600' : 'text-slate-900 group-hover:text-indigo-500'}`}>{ch.chapter}</h4>
                      {loadingChapter === idx && (
                        <div className="flex items-center gap-3 text-indigo-500 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100">
                          <span className="text-[10px] font-black uppercase tracking-widest">Neural Scanning...</span>
                          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        </div>
                      )}
                    </div>
                    <p className="text-slate-600 text-lg leading-relaxed font-bold mb-6 opacity-80">{ch.summary}</p>
                    
                    {expandedChapters.has(idx) && detailedChapters[idx] && (
                      <div className="mt-12 p-12 md:p-20 bg-gradient-to-br from-white to-slate-50 rounded-[64px] border-4 border-slate-100 shadow-[0_40px_100px_rgba(0,0,0,0.08)] animate-in zoom-in-95 slide-in-from-top-12 duration-700 relative overflow-hidden group-expanded">
                        <div className="absolute top-0 left-0 w-3 h-full bg-indigo-600 shadow-[0_0_20px_rgba(79,70,229,0.4)]"></div>
                        
                        <div className="flex items-start gap-8 mb-16 relative z-10">
                           <div className="w-20 h-20 rounded-[32px] bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-2xl rotate-3 hover:rotate-0 transition-transform duration-500">
                              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                              </svg>
                           </div>
                           <div>
                              <p className="text-xs font-black text-indigo-600 uppercase tracking-[0.6em] mb-2 opacity-60">Insight Generation</p>
                              <p className="text-2xl font-black text-slate-950 uppercase tracking-tighter leading-tight">Phân tích chuyên sâu: {ch.chapter}</p>
                           </div>
                        </div>
                        
                        <div className="markdown-content relative z-10">
                          {formatMarkdown(detailedChapters[idx])}
                        </div>
                        
                        <div className="mt-24 pt-12 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-10 relative z-10">
                           <div className="flex items-center gap-4">
                             <div className="w-4 h-4 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-200"></div>
                             <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] italic">Dữ liệu được bảo chứng bởi Gemini Deep Search</p>
                           </div>
                           <button 
                            onClick={(e) => { e.stopPropagation(); handleChapterClick(idx, ch.chapter); }}
                            className="flex items-center gap-5 text-[11px] font-black text-slate-900 uppercase tracking-[0.4em] hover:text-indigo-600 transition-all px-10 py-5 bg-white rounded-3xl border-2 border-slate-200 hover:border-indigo-200 shadow-sm hover:shadow-xl"
                           >
                            ĐÓNG PHÂN TÍCH
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 15l7-7 7 7" />
                            </svg>
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

        {/* AI Chat Sidebar */}
        <div className={`absolute top-0 right-0 h-full bg-slate-50 border-l border-slate-200 z-40 w-full md:w-[400px] transform transition-transform duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${showChat ? 'translate-x-0 shadow-[-40px_0_80px_rgba(0,0,0,0.1)]' : 'translate-x-full'}`}>
          <div className="flex flex-col h-full">
            <div className="px-8 py-7 bg-white border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-200">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-[11px] uppercase tracking-widest">Scholar Advisor</h4>
                  <p className="text-[10px] text-emerald-500 font-black uppercase mt-1">Live Connection</p>
                </div>
              </div>
              <button 
                onClick={() => setShowChat(false)}
                className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-slate-50/50">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-3 duration-500`}>
                  <div className={`max-w-[90%] px-6 py-5 rounded-[28px] text-sm font-semibold leading-relaxed shadow-sm ${
                    msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-br-none shadow-indigo-200' 
                    : 'bg-white text-slate-800 border border-slate-200/50 rounded-bl-none'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start animate-pulse">
                  <div className="bg-white border border-slate-200 px-6 py-4 rounded-[24px] rounded-bl-none flex gap-1.5 items-center">
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-150"></span>
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-300"></span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-8 bg-white border-t border-slate-100">
              <form onSubmit={handleSendMessage} className="relative">
                <input 
                  type="text"
                  placeholder="Trao đổi thêm về nội dung..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-[24px] pl-6 pr-16 py-5 text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-semibold placeholder:text-slate-400 shadow-inner"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  disabled={isTyping}
                />
                <button 
                  type="submit"
                  disabled={!inputValue.trim() || isTyping}
                  className="absolute right-2.5 top-2.5 w-12 h-12 bg-indigo-600 text-white rounded-[18px] flex items-center justify-center hover:bg-indigo-700 transition-all disabled:opacity-50 active:scale-90 shadow-lg shadow-indigo-600/20"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>
              <p className="text-[9px] text-center text-slate-400 font-black uppercase mt-5 tracking-[0.3em]">AI Generative Knowledge by Gemini</p>
            </div>
          </div>
        </div>

        {/* Mobile Toggle Chat */}
        {!showChat && (
          <button 
            onClick={() => setShowChat(true)}
            className="md:hidden fixed bottom-8 right-8 z-50 w-16 h-16 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center transition-all active:scale-90 hover:scale-110"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </button>
        )}

      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
        .custom-scrollbar-dark::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar-dark::-webkit-scrollbar-track {
          background: #0f172a;
        }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 20px;
        }
        .group-expanded {
          transition: all 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .markdown-content p {
          margin-bottom: 2rem;
        }
        .markdown-content h2, .markdown-content h3, .markdown-content h4 {
          scroll-margin-top: 100px;
        }
      `}</style>
    </div>
  );
};

export default AnalysisView;
