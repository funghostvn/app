
import { BookAnalysis } from '../types';

const STORAGE_KEY = 'book_analyses_v1';

export const saveAnalysis = (bookId: number, analysis: BookAnalysis) => {
  const allAnalyses = getAllAnalyses();
  allAnalyses[bookId] = analysis;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allAnalyses));
};

export const getAnalysis = (bookId: number): BookAnalysis | null => {
  const allAnalyses = getAllAnalyses();
  return allAnalyses[bookId] || null;
};

export const getAllAnalyses = (): Record<number, BookAnalysis> => {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch (e) {
    console.error("Error parsing stored analyses", e);
    return {};
  }
};
