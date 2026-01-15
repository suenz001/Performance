export interface ExtractedRecord {
  id: string;
  fileName: string;
  pageNumber: number;
  unitTitle: string;
  name: string;
  supervisorRating: string;
}

export interface ProcessingStatus {
  total: number;
  current: number;
  filename: string;
}

export enum AppState {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}