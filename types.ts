
export interface Book {
  id: number;
  year: number;
  titleEn: string;
  titleVi: string;
  author: string;
  category: string;
}

export interface RelatedBook {
  id: number;
  reason: string;
}

export interface BookAnalysis {
  mainSummary: string;
  coreContents: string[];
  relevance2015_2025: string;
  forecast2025_2030: string;
  applicationVietnam: string;
  chapterSummaries: { chapter: string; summary: string }[];
  relatedSimilar: RelatedBook[]; // Books with similar views and reasons
  relatedOpposing: RelatedBook[]; // Books with opposing views and reasons
  recommendations: RelatedBook[]; // Suggestions based on the analysis
  timestamp: number;
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  VIEWING = 'VIEWING'
}
