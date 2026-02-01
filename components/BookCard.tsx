
import React, { useState, useEffect, useRef } from 'react';
import { Book } from '../types';

interface BookCardProps {
  book: Book;
  isAnalyzed: boolean;
  onViewDetails: (book: Book) => void;
  onAnalyze: (book: Book) => void;
}

const BookCard: React.FC<BookCardProps> = ({ book, isAnalyzed, onViewDetails, onAnalyze }) => {
  const [justCompleted, setJustCompleted] = useState(false);
  const prevAnalyzed = useRef(isAnalyzed);

  useEffect(() => {
    // Kích hoạt hiệu ứng "vừa hoàn thành" khi trạng thái chuyển từ chưa phân tích sang đã phân tích
    if (!prevAnalyzed.current && isAnalyzed) {
      setJustCompleted(true);
      const timer = setTimeout(() => setJustCompleted(false), 3000);
      return () => clearTimeout(timer);
    }
    prevAnalyzed.current = isAnalyzed;
  }, [isAnalyzed]);

  return (
    <div className={`group relative bg-white rounded-[32px] border transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] flex flex-col h-full overflow-hidden ${
      isAnalyzed 
      ? 'border-emerald-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_30px_60px_rgba(16,185,129,0.15)] hover:border-emerald-400 hover:-translate-y-3 hover:scale-[1.02]' 
      : 'border-slate-200 shadow-sm hover:shadow-[0_30px_60px_rgba(99,102,241,0.12)] hover:border-indigo-400 hover:-translate-y-3 hover:scale-[1.02]'
    } ${justCompleted ? 'animate-success-highlight ring-4 ring-emerald-500/20' : ''}`}>
      
      {/* Visual Status Indicator (Glow & Accent) */}
      <div className={`absolute top-0 left-0 w-2 h-full transition-all duration-700 ${
        isAnalyzed ? 'bg-emerald-500' : 'bg-slate-200 group-hover:bg-indigo-400'
      }`}></div>

      {/* Status Badge & Icon */}
      <div className="absolute top-5 right-5 flex items-center gap-1.5 z-10">
        <div className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border flex items-center gap-1.5 transition-all duration-500 ${
          isAnalyzed 
          ? 'bg-emerald-50 border-emerald-100 text-emerald-600 shadow-sm scale-105 group-hover:bg-emerald-100' 
          : 'bg-slate-50 border-slate-100 text-slate-400 group-hover:border-indigo-200 group-hover:text-indigo-500'
        }`}>
          {isAnalyzed ? (
            <>
              <svg className="w-3.5 h-3.5 animate-in zoom-in-50 duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
              </svg>
              <span>Đã phân tích</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-slate-300 animate-pulse group-hover:bg-indigo-400"></span>
              <span>Sẵn sàng</span>
            </>
          )}
        </div>
      </div>

      <div className="p-8 pt-16 flex-1 flex flex-col">
        {/* Meta Info */}
        <div className="flex items-center gap-2 mb-5">
          <span className={`text-[10px] font-black px-3 py-1.5 rounded-xl border transition-all duration-500 ${
            isAnalyzed 
            ? 'bg-emerald-100/50 border-emerald-200 text-emerald-700 group-hover:bg-emerald-100' 
            : 'bg-indigo-50 border-indigo-100 text-indigo-600 group-hover:bg-indigo-100/50'
          }`}>
            ID #{book.id}
          </span>
          <span className="text-xs font-bold text-slate-400 group-hover:text-slate-600">
            {book.year}
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-[10px] uppercase font-black text-slate-400 tracking-[0.2em] group-hover:text-indigo-500">
            {book.category}
          </span>
        </div>

        {/* Titles */}
        <h3 className={`text-2xl font-black leading-tight mb-3 transition-colors duration-300 group-hover:text-indigo-600 ${
          isAnalyzed ? 'text-slate-900' : 'text-slate-700'
        }`}>
          {book.titleVi}
        </h3>
        <p className="text-sm font-semibold italic text-slate-400 group-hover:text-slate-500 mb-8 line-clamp-2 leading-relaxed">
          {book.titleEn}
        </p>

        {/* Author */}
        <div className="flex items-center gap-4 mt-auto pt-6 border-t border-slate-100">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-black transition-all duration-700 ${
            isAnalyzed 
            ? 'bg-emerald-100 text-emerald-700 rotate-6 group-hover:rotate-0 group-hover:scale-110 shadow-sm shadow-emerald-200' 
            : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600'
          }`}>
            {book.author.charAt(0)}
          </div>
          <div className="flex flex-col">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Tác giả</p>
            <p className="text-base font-black text-slate-800 leading-none group-hover:text-indigo-700 transition-colors">{book.author}</p>
          </div>
        </div>
      </div>
      
      {/* Actions */}
      <div className="p-6 bg-slate-50/50 flex flex-col gap-3 border-t border-slate-100/80">
        <button
          onClick={() => onViewDetails(book)}
          disabled={!isAnalyzed}
          className={`group/btn flex items-center justify-center gap-2.5 py-3.5 px-5 text-[11px] font-black rounded-2xl transition-all border ${
            isAnalyzed 
            ? 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 shadow-sm hover:shadow-emerald-300/40' 
            : 'bg-white text-slate-300 border-slate-200 cursor-not-allowed grayscale'
          }`}
        >
          <svg className="w-4.5 h-4.5 transition-transform group-hover/btn:scale-125" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          XEM PHÂN TÍCH CHUYÊN SÂU
        </button>
        
        <button
          onClick={() => onAnalyze(book)}
          className={`flex items-center justify-center gap-2.5 py-3.5 px-5 text-[11px] font-black rounded-2xl transition-all shadow-md active:scale-95 ${
            isAnalyzed
            ? 'bg-slate-800 text-slate-200 hover:bg-slate-900 hover:text-white'
            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/30'
          }`}
        >
          <svg className={`w-4.5 h-4.5 ${isAnalyzed ? 'opacity-50' : 'animate-pulse'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {isAnalyzed ? 'CẬP NHẬT PHÂN TÍCH' : 'PHÂN TÍCH NGAY VỚI AI'}
        </button>
      </div>
    </div>
  );
};

export default BookCard;
