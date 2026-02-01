
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Book, BookAnalysis, AnalysisStatus } from './types';
import { BOOKS_LIST } from './constants';
import { analyzeBook } from './services/geminiService';
import { saveAnalysis, getAllAnalyses, getAnalysis } from './services/storageService';
import BookCard from './components/BookCard';
import AnalysisView from './components/AnalysisView';

const LOADING_STEPS = [
  "Khởi tạo kết nối Gemini API...",
  "Truy xuất dữ liệu tác phẩm...",
  "AI đang đọc hiểu nội dung...",
  "Đánh giá giá trị thực tiễn...",
  "Tổng hợp báo cáo phân tích..."
];

type SortOrder = 'asc' | 'desc';

interface BulkHistoryItem {
  id: number;
  title: string;
  status: 'success' | 'error';
}

const App: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('Tất cả');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [analysis, setAnalysis] = useState<BookAnalysis | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [errorMessage, setErrorMessage] = useState('');
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  
  // Bulk Analysis States
  const [isBulkAnalyzing, setIsBulkAnalyzing] = useState(false);
  const [bulkCurrentIndex, setBulkCurrentIndex] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkErrors, setBulkErrors] = useState<number>(0);
  const [bulkSubStatus, setBulkSubStatus] = useState<string>('');
  const [bulkHistory, setBulkHistory] = useState<BulkHistoryItem[]>([]);
  const stopBulkRef = useRef(false);

  // Track all saved analyses IDs
  const [savedAnalysesMap, setSavedAnalysesMap] = useState<Record<number, BookAnalysis>>({});

  useEffect(() => {
    // Khởi tạo dữ liệu từ LocalStorage
    setSavedAnalysesMap(getAllAnalyses());
  }, []);

  // Sync progress for single analysis
  useEffect(() => {
    let interval: number;
    if (status === AnalysisStatus.LOADING && !isBulkAnalyzing) {
      setLoadingStepIndex(0);
      setProgress(5);
      interval = window.setInterval(() => {
        setLoadingStepIndex(prev => (prev + 1) % LOADING_STEPS.length);
        setProgress(prev => Math.min(prev + 15, 95));
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [status, isBulkAnalyzing]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(BOOKS_LIST.map(b => b.category)));
    return ['Tất cả', ...cats];
  }, []);

  const filteredBooks = useMemo(() => {
    const filtered = BOOKS_LIST.filter(b => {
      const matchesSearch = b.titleVi.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            b.titleEn.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            b.author.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = activeCategory === 'Tất cả' || b.category === activeCategory;
      return matchesSearch && matchesCategory;
    });

    return filtered.sort((a, b) => {
      return sortOrder === 'asc' ? a.year - b.year : b.year - a.year;
    });
  }, [searchTerm, activeCategory, sortOrder]);

  const handleAnalyze = async (book: Book) => {
    setSelectedBook(book);
    setStatus(AnalysisStatus.LOADING);
    setAnalysis(null);
    setErrorMessage('');

    try {
      const result = await analyzeBook(book);
      const analysisWithTime = { ...result, timestamp: Date.now() };
      saveAnalysis(book.id, analysisWithTime);
      setSavedAnalysesMap(prev => ({ ...prev, [book.id]: analysisWithTime }));
      setAnalysis(analysisWithTime);
      setStatus(AnalysisStatus.SUCCESS);
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi kết nối AI. Vui lòng kiểm tra API Key hoặc mạng.');
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const handleAnalyzeAll = async () => {
    // Xác định chính xác các cuốn chưa được phân tích
    const currentAnalyses = getAllAnalyses();
    const remainingBooks = BOOKS_LIST.filter(b => !currentAnalyses[b.id]);
    
    if (remainingBooks.length === 0) {
      alert("Tất cả 95 tác phẩm đã được phân tích hoàn tất và lưu trữ.");
      return;
    }

    const confirmAction = window.confirm(`Hệ thống tìm thấy ${remainingBooks.length} tác phẩm chưa có dữ liệu. Bắt đầu phân tích tự động tuần tự cho các mục này?`);
    if (!confirmAction) return;

    setIsBulkAnalyzing(true);
    setBulkTotal(remainingBooks.length);
    setBulkCurrentIndex(0);
    setBulkErrors(0);
    setBulkHistory([]);
    setBulkSubStatus('Đang chuẩn bị hàng đợi phân tích...');
    stopBulkRef.current = false;

    // Chờ UI cập nhật
    await new Promise(resolve => setTimeout(resolve, 800));

    for (let i = 0; i < remainingBooks.length; i++) {
      if (stopBulkRef.current) break;
      
      const book = remainingBooks[i];
      setBulkCurrentIndex(i + 1);
      setSelectedBook(book);
      
      try {
        setBulkSubStatus(`Đang phân tích: ${book.titleVi}...`);
        const result = await analyzeBook(book);
        
        setBulkSubStatus(`Đang lưu kết quả của ${book.id}...`);
        const analysisWithTime = { ...result, timestamp: Date.now() };
        saveAnalysis(book.id, analysisWithTime);
        
        // Cập nhật state để UI phản hồi ngay
        setSavedAnalysesMap(prev => ({ ...prev, [book.id]: analysisWithTime }));
        
        // Thêm vào lịch sử mini
        setBulkHistory(prev => [{ id: book.id, title: book.titleVi, status: 'success' as const }, ...prev].slice(0, 3));
        setBulkSubStatus(`Hoàn tất: ${book.titleVi}`);
        
        // Delay nhẹ để tránh bị limit rate API
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (err) {
        console.error(`Lỗi tại cuốn #${book.id}:`, err);
        setBulkErrors(prev => prev + 1);
        setBulkHistory(prev => [{ id: book.id, title: book.titleVi, status: 'error' as const }, ...prev].slice(0, 3));
        setBulkSubStatus(`Thất bại: ${book.titleVi}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    setIsBulkAnalyzing(false);
    setBulkSubStatus('');
    setSelectedBook(null);
    
    if (!stopBulkRef.current) {
      const successCount = bulkTotal - bulkErrors;
      alert(`QUÁ TRÌNH HOÀN TẤT\n-------------------\nThành công: ${successCount}\nThất bại: ${bulkErrors}\nTổng cộng: ${bulkTotal}`);
    }
  };

  const stopBulkAnalysis = () => {
    if (window.confirm("Dừng quá trình phân tích hàng loạt? Các dữ liệu đã phân tích thành công trước đó vẫn sẽ được lưu giữ.")) {
      stopBulkRef.current = true;
      setIsBulkAnalyzing(false);
    }
  };

  const handleViewDetails = (book: Book) => {
    const saved = getAnalysis(book.id);
    if (saved) {
      setSelectedBook(book);
      setAnalysis(saved);
      setStatus(AnalysisStatus.SUCCESS);
    }
  };

  const handleCloseAnalysis = () => {
    setStatus(AnalysisStatus.IDLE);
    setAnalysis(null);
    setSelectedBook(null);
  };

  const handleNavigateToBook = (bookId: number) => {
    const book = BOOKS_LIST.find(b => b.id === bookId);
    if (!book) return;

    const saved = getAnalysis(bookId);
    if (saved) {
      setSelectedBook(book);
      setAnalysis(saved);
      setStatus(AnalysisStatus.SUCCESS);
    } else {
      if (window.confirm(`Tác phẩm "${book.titleVi}" chưa được phân tích. Bắt đầu phân tích ngay?`)) {
        handleAnalyze(book);
      }
    }
  };

  return (
    <div className="min-h-screen pb-20 bg-[#f8fafc]">
      {/* Header */}
      <header className="bg-slate-900 text-white pt-16 pb-28 px-4 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] -mr-64 -mt-64"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] -ml-64 -mb-64"></div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10">
            <div className="space-y-6 flex-1">
              <div className="inline-flex items-center gap-3 bg-white/5 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Gemini 3 Flash Ready</span>
              </div>
              <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1]">
                Phân Tích <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-emerald-400">
                  95 Tác Phẩm Kinh Điển
                </span>
              </h1>
              <p className="text-slate-400 text-lg md:text-xl max-w-2xl font-medium leading-relaxed">
                Hệ thống AI tự động hóa việc tóm tắt, trích xuất nội dung cốt lõi và ứng dụng thực tiễn cho 95 tác phẩm tri thức quan trọng nhất.
              </p>
            </div>
            
            <div className="flex flex-col gap-4 w-full lg:w-[420px]">
               <div className="relative">
                <input 
                  type="text"
                  placeholder="Tìm kiếm tác phẩm, tác giả..."
                  className="w-full bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 text-white pl-14 pr-6 py-5 rounded-[24px] focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-500 shadow-2xl text-lg font-medium"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <svg className="w-6 h-6 absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              <div className="grid grid-cols-2 gap-3">
                 <div className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Đã phân tích</p>
                    <p className="text-2xl font-black text-white">{Object.keys(savedAnalysesMap).length}<span className="text-slate-600">/95</span></p>
                 </div>
                 <button
                  onClick={handleAnalyzeAll}
                  disabled={isBulkAnalyzing}
                  className="bg-gradient-to-br from-indigo-600 to-violet-700 hover:from-indigo-500 hover:to-violet-600 text-white p-4 rounded-2xl flex flex-col items-start justify-center transition-all shadow-xl shadow-indigo-900/20 active:scale-95 disabled:opacity-50"
                >
                  <p className="text-[10px] font-black uppercase opacity-70 mb-1">Chạy tự động</p>
                  <span className="text-xs font-black uppercase tracking-wider">Phân tích toàn bộ</span>
                </button>
              </div>
            </div>
          </div>
          
          <div className="mt-16 flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-2">Chủ đề:</span>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${
                    activeCategory === cat 
                    ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/40' 
                    : 'bg-transparent border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-2">Sắp xếp:</span>
              <button
                onClick={() => setSortOrder('asc')}
                className={`text-[10px] font-black uppercase px-4 py-2 rounded-lg transition-all ${sortOrder === 'asc' ? 'bg-white text-slate-900' : 'text-slate-500 hover:text-white'}`}
              >
                Theo thời đại
              </button>
              <button
                onClick={() => setSortOrder('desc')}
                className={`text-[10px] font-black uppercase px-4 py-2 rounded-lg transition-all ${sortOrder === 'desc' ? 'bg-white text-slate-900' : 'text-slate-500 hover:text-white'}`}
              >
                Mới nhất trước
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="max-w-7xl mx-auto px-4 -mt-12 relative z-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredBooks.map(book => (
            <BookCard 
              key={book.id}
              book={book}
              isAnalyzed={!!savedAnalysesMap[book.id]}
              onViewDetails={handleViewDetails}
              onAnalyze={handleAnalyze}
            />
          ))}
        </div>

        {filteredBooks.length === 0 && (
          <div className="py-40 text-center bg-white rounded-[48px] shadow-xl border border-slate-100">
            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
               <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
               </svg>
            </div>
            <p className="text-slate-400 text-lg font-bold">Không tìm thấy tác phẩm này trong hệ thống.</p>
            <button 
              onClick={() => { setSearchTerm(''); setActiveCategory('Tất cả'); }}
              className="mt-6 px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs hover:bg-slate-800 transition-all uppercase tracking-widest"
            >
              Xem tất cả danh sách
            </button>
          </div>
        )}
      </main>

      {/* Bulk Status Panel - Right Side Floating */}
      {isBulkAnalyzing && (
        <div className="fixed bottom-10 right-10 z-[100] w-[450px] bg-slate-900 border border-slate-700/50 rounded-[32px] shadow-[0_30px_100px_rgba(0,0,0,0.8)] p-8 backdrop-blur-3xl animate-in slide-in-from-right-10 duration-700">
          <div className="absolute top-0 left-0 h-2 bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500 transition-all duration-1000 rounded-t-[32px] glow-bar" style={{ width: `${(bulkCurrentIndex / bulkTotal) * 100}%` }}></div>
          
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-[20px] bg-indigo-500/20 flex items-center justify-center border border-indigo-500/20">
                 <svg className="w-6 h-6 text-indigo-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                 </svg>
              </div>
              <div>
                <h3 className="font-black text-white text-base uppercase tracking-widest leading-none">AI AUTO-SCAN</h3>
                <p className="text-[10px] text-emerald-400 font-black uppercase mt-1">Đang xử lý hàng loạt</p>
              </div>
            </div>
            <button 
              onClick={stopBulkAnalysis} 
              className="px-5 py-2.5 bg-red-500/10 text-red-400 rounded-xl text-[10px] font-black uppercase hover:bg-red-500/20 transition-all border border-red-500/20"
            >
              Hủy bỏ
            </button>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
               <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <p className="text-[10px] text-slate-500 font-black uppercase mb-1">Đang xử lý</p>
                  <p className="text-3xl font-black text-white">
                    {bulkCurrentIndex} <span className="text-slate-600">/ {bulkTotal}</span>
                  </p>
               </div>
               <div className="bg-red-500/5 p-4 rounded-2xl border border-red-500/10">
                  <p className="text-[10px] text-slate-500 font-black uppercase mb-1">Gặp lỗi</p>
                  <p className="text-3xl font-black text-red-500">{bulkErrors}</p>
               </div>
            </div>

            <div className="space-y-4">
              <div className="p-6 bg-gradient-to-br from-indigo-500/10 to-violet-500/10 rounded-2xl border border-indigo-500/20 relative overflow-hidden">
                <div className="absolute top-4 right-4 flex gap-1">
                   <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce delay-75"></span>
                   <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce delay-150"></span>
                   <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce delay-300"></span>
                </div>
                <p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.2em] mb-3">Target: {selectedBook?.id}</p>
                <p className="text-base text-white font-black leading-tight mb-2 truncate">{selectedBook?.titleVi}</p>
                <div className="flex items-center gap-2">
                   <div className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                   </div>
                   <p className="text-[11px] text-slate-300 font-bold italic">{bulkSubStatus}</p>
                </div>
              </div>

              {bulkHistory.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest pl-1">Nhật ký xử lý gần nhất</p>
                  <div className="space-y-2">
                    {bulkHistory.map((item, idx) => (
                      <div key={`${item.id}-${idx}`} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 animate-in fade-in slide-in-from-left-4 duration-500">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${item.status === 'success' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}></div>
                          <span className="text-xs text-slate-200 font-bold truncate">{item.title}</span>
                        </div>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${item.status === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                          {item.status === 'success' ? 'SUCCESS' : 'FAILED'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Single Analysis Loading Overlay */}
      {status === AnalysisStatus.LOADING && !isBulkAnalyzing && (
        <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-2xl flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center">
            <div className="mb-14 relative flex justify-center">
               <div className="w-40 h-40 rounded-[60px] border-[8px] border-indigo-500/10 border-t-indigo-500 animate-spin"></div>
               <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white font-black text-3xl tabular-nums">{progress}%</span>
               </div>
            </div>
            <h2 className="text-4xl font-black text-white mb-6 tracking-tight">AI Analysis in Progress</h2>
            <div className="bg-slate-800/40 rounded-[32px] p-8 border border-white/5">
               <p className="text-indigo-400 font-black text-[10px] uppercase tracking-[0.3em] mb-6">{LOADING_STEPS[loadingStepIndex]}</p>
               <div className="w-full bg-slate-700/50 rounded-full h-3 overflow-hidden">
                  <div className="bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500 h-full transition-all duration-1000 shadow-[0_0_20px_rgba(99,102,241,0.5)]" style={{ width: `${progress}%` }}></div>
               </div>
               <div className="mt-8 pt-6 border-t border-white/5">
                  <p className="text-slate-500 text-[10px] font-black uppercase mb-2">Tác phẩm đang xử lý</p>
                  <p className="text-white text-lg font-bold">"{selectedBook?.titleVi}"</p>
                  <p className="text-slate-400 text-xs font-medium italic mt-1">{selectedBook?.author}</p>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {status === AnalysisStatus.ERROR && (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-white rounded-[48px] p-12 max-w-md w-full shadow-2xl text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-red-500"></div>
            <div className="w-24 h-24 bg-red-50 text-red-500 rounded-[32px] flex items-center justify-center mx-auto mb-8">
               <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
               </svg>
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-4">Phân tích thất bại</h2>
            <p className="text-slate-500 font-medium mb-10 leading-relaxed text-lg">{errorMessage}</p>
            <button 
              onClick={handleCloseAnalysis} 
              className="w-full py-5 bg-slate-900 text-white font-black rounded-3xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 active:scale-95"
            >
              Đóng và thử lại
            </button>
          </div>
        </div>
      )}

      {/* Success Analysis Detail View */}
      {status === AnalysisStatus.SUCCESS && analysis && selectedBook && (
        <AnalysisView 
          book={selectedBook} 
          analysis={analysis} 
          onClose={handleCloseAnalysis} 
          onNavigateToBook={handleNavigateToBook}
        />
      )}

      <footer className="mt-40 border-t border-slate-200 py-24 text-center">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-center gap-4 mb-8">
             <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center">
                <span className="text-white font-black text-xl">95</span>
             </div>
             <h4 className="text-slate-900 font-black text-lg uppercase tracking-widest">Book Analyzer AI</h4>
          </div>
          <p className="text-slate-400 text-xs font-black uppercase tracking-[0.3em] mb-6">
            © 2025 • Công nghệ AI thế hệ mới • Gemini 3 Flash
          </p>
          <div className="max-w-xl mx-auto h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent"></div>
          <p className="text-slate-400 text-sm mt-8 leading-relaxed max-w-2xl mx-auto">
            Dữ liệu được xử lý thời gian thực và lưu trữ an toàn trên trình duyệt của bạn. 
            Phân tích này mang tính tham khảo chuyên sâu dựa trên các mô hình ngôn ngữ lớn.
          </p>
        </div>
      </footer>

      <style>{`
        .glow-bar {
          box-shadow: 0 0 20px rgba(99, 102, 241, 0.4);
        }
        @keyframes pulse-soft {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        .animate-pulse-soft {
          animation: pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes success-highlight {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
          50% { transform: scale(1.02); box-shadow: 0 0 30px 10px rgba(16, 185, 129, 0.2); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        .animate-success-highlight {
          animation: success-highlight 1.5s ease-out;
        }
      `}</style>
    </div>
  );
};

export default App;
