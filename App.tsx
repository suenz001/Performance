import React, { useState, useCallback } from 'react';
import { AppState, ExtractedRecord, ProcessingStatus } from './types';
import DropZone from './components/DropZone';
import ResultList from './components/ResultList';
import ProgressBar from './components/ProgressBar';
import { convertPdfToImages } from './utils/pdfUtils';
import { extractTextFromDocx } from './utils/docxUtils';
import { extractDataFromDocument } from './services/geminiService';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [records, setRecords] = useState<ExtractedRecord[]>([]);
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // 1. Modified: Only store files, don't start processing yet
  const handleFilesSelected = useCallback((files: File[]) => {
    setPendingFiles(files);
    setRecords([]);
    setErrorMsg(null);
    setAppState(AppState.IDLE);
    setStatus(null);
  }, []);

  // 2. New: The actual processing logic moved here
  const handleStartProcessing = useCallback(async () => {
    if (pendingFiles.length === 0) return;

    setAppState(AppState.PROCESSING);
    setRecords([]);
    setErrorMsg(null);
    setStatus({ total: pendingFiles.length, current: 0, filename: '初始化中...' });

    const allRecords: ExtractedRecord[] = [];
    const files = pendingFiles; // Use the pending files

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Update status for the start of this file
        setStatus({
          total: files.length,
          current: i,
          filename: file.name,
        });

        // 1. Check for legacy .doc format first
        if (file.name.toLowerCase().endsWith('.doc') && !file.name.toLowerCase().endsWith('.docx')) {
           throw new Error(
             `無法讀取檔案 "${file.name}"。\n\n本工具使用瀏覽器技術，僅支援 Word 2007 以後的 ".docx" 格式。舊版的 ".doc" (二進位格式) 無法直接讀取。\n\n請您用 Word 開啟該檔案，選擇「另存新檔」並存為 ".docx" 或 ".pdf" 格式後再上傳。`
           );
        }

        // 2. Determine file type and process
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
           // PDF Processing
           const pages = await convertPdfToImages(file);
           
           for (let j = 0; j < pages.length; j++) {
             const page = pages[j];
             const pageRecords = await extractDataFromDocument({
               base64Image: page.base64,
               textContent: page.textContent,
               fileName: file.name,
               pageNumber: page.pageNumber
             });
             allRecords.push(...pageRecords);
             setRecords(prev => [...prev, ...pageRecords]);
           }

        } else if (
          file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
          file.name.endsWith('.docx')
        ) {
           // DOCX Processing (Text Only)
           const textContent = await extractTextFromDocx(file);
           const docxRecords = await extractDataFromDocument({
             textContent: textContent,
             fileName: file.name,
             pageNumber: 1 // DOCX treated as single unit usually
           });
           allRecords.push(...docxRecords);
           setRecords(prev => [...prev, ...docxRecords]);
        }

        // Update status to show this file is done (or preparing for next)
        setStatus({
          total: files.length,
          current: i + 1,
          filename: file.name,
        });
      }
      setAppState(AppState.COMPLETED);
    } catch (err: any) {
      console.error(err);
      setAppState(AppState.ERROR);
      // Use the specific error message if thrown manually, otherwise generic
      setErrorMsg(err.message || "處理檔案時發生錯誤。請確認您的 API 金鑰是否正確，或檔案格式是否正確。");
    } finally {
      // Don't clear status immediately so user sees 100%
    }
  }, [pendingFiles]);

  const handleExportTxt = useCallback(() => {
    if (records.length === 0) return;
    const textContent = records
      .map(r => `${r.unitTitle} ${r.name} ${r.supervisorRating}`)
      .join('\n');
    downloadFile(textContent, 'txt', 'text/plain;charset=utf-8');
  }, [records]);

  const handleExportCsv = useCallback(() => {
    if (records.length === 0) return;
    // CSV Header
    const header = ['單位/職稱', '姓名', '單位主管擬評', '來源檔案'];
    // CSV Rows
    const rows = records.map(r => [
      `"${r.unitTitle}"`, 
      `"${r.name}"`, 
      `"${r.supervisorRating}"`,
      `"${r.fileName}"`
    ]);
    
    const csvContent = [
      header.join(','), 
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Add BOM for Excel to recognize UTF-8
    const contentWithBOM = '\uFEFF' + csvContent;
    downloadFile(contentWithBOM, 'csv', 'text/csv;charset=utf-8');
  }, [records]);

  const downloadFile = (content: string, extension: string, type: string) => {
    const blob = new Blob([content], { type: type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `performance_reviews_${Date.now()}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleReset = useCallback(() => {
    setAppState(AppState.IDLE);
    setRecords([]);
    setPendingFiles([]); // Clear pending files too
    setErrorMsg(null);
    setStatus(null);
  }, []);

  const handleClearPending = useCallback(() => {
    setPendingFiles([]);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight sm:text-4xl mb-2">
            考績評分清冊擷取工具
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            支援 PDF 與 Word (.docx) 檔案。透過 Gemini AI 自動擷取單位、姓名及主管擬評分數。
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          {/* State: IDLE or ERROR (allowing re-selection) */}
          {(appState === AppState.IDLE || appState === AppState.ERROR) && (
            <div className="space-y-6">
              <DropZone onFilesSelected={handleFilesSelected} disabled={false} />
              
              {/* Selected Files List & Action Button */}
              {pendingFiles.length > 0 && (
                <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-slate-800 flex items-center">
                      <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      已選擇檔案 ({pendingFiles.length})
                    </h3>
                    <button 
                      onClick={handleClearPending}
                      className="text-sm text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    >
                      清除全部
                    </button>
                  </div>
                  
                  <ul className="space-y-2 mb-6 max-h-48 overflow-y-auto">
                    {pendingFiles.map((file, idx) => (
                      <li key={idx} className="text-sm text-slate-600 flex items-center bg-white p-2 rounded border border-slate-100">
                        <span className="w-2 h-2 bg-slate-400 rounded-full mr-3"></span>
                        {file.name}
                        <span className="ml-auto text-xs text-slate-400">
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex justify-center">
                    <button
                      onClick={handleStartProcessing}
                      className="w-full sm:w-auto px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 shadow-md hover:shadow-lg transform transition-all active:scale-95 flex items-center justify-center"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      開始擷取資料
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {appState === AppState.PROCESSING && status && (
            <div className="py-8">
              <ProgressBar 
                current={status.current} 
                total={status.total} 
                filename={status.filename} 
              />
            </div>
          )}

          {appState === AppState.ERROR && (
            <div className="text-center py-8">
               <div className="bg-red-50 text-red-800 p-4 rounded-lg mb-6 inline-block text-left max-w-lg">
                 <div className="flex items-center mb-2">
                    <svg className="w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="font-bold text-lg">無法處理檔案</p>
                 </div>
                 <p className="text-sm whitespace-pre-wrap leading-relaxed">{errorMsg}</p>
               </div>
               {/* Note: Retry button logic is covered by the IDLE state showing the "Start" button again if files are still there */}
            </div>
          )}

          {appState === AppState.COMPLETED && (
             <div className="flex flex-col items-center">
                <div className="w-full flex justify-between items-center mb-4 bg-green-50 p-4 rounded-lg border border-green-100">
                  <div className="flex items-center text-green-800">
                     <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                     </svg>
                     <span className="font-medium">成功處理 {records.length} 筆資料。</span>
                  </div>
                  <div className="flex gap-2">
                     <button
                        onClick={handleReset}
                        className="text-sm text-green-700 hover:text-green-900 font-medium underline px-2"
                     >
                        重新開始
                     </button>
                  </div>
                </div>

                <div className="w-full flex justify-end gap-3 sticky top-0 z-10 bg-white py-2 border-b border-slate-100 mb-2">
                   <button
                     onClick={handleExportCsv}
                     className="inline-flex items-center px-4 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                   >
                     <svg className="-ml-1 mr-2 h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                     </svg>
                     匯出 CSV
                   </button>
                   <button
                     onClick={handleExportTxt}
                     className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                   >
                     <svg className="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                     </svg>
                     匯出 .txt
                   </button>
                </div>
             </div>
          )}

          {(appState === AppState.COMPLETED || records.length > 0) && (
            <ResultList records={records} />
          )}
        </div>
        
        {appState === AppState.IDLE && (
           <p className="text-center text-xs text-slate-400 mt-8">
             注意：本應用程式需要設定 <code>API_KEY</code> 環境變數才能使用 Gemini API。
           </p>
        )}
      </div>
    </div>
  );
};

export default App;