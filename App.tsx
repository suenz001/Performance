import React, { useState, useCallback, useMemo } from 'react';
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
  const [duplicateNames, setDuplicateNames] = useState<string[]>([]);

  const isApiKeyDetected = useMemo(() => {
    return !!process.env.API_KEY && process.env.API_KEY.length > 10;
  }, []);

  const handleFilesSelected = useCallback((files: File[]) => {
    setPendingFiles(files);
    setRecords([]);
    setErrorMsg(null);
    setAppState(AppState.IDLE);
  }, []);

  const handleStartProcessing = useCallback(async () => {
    if (pendingFiles.length === 0) return;

    setAppState(AppState.PROCESSING);
    setRecords([]);
    setErrorMsg(null);
    setStatus({ total: pendingFiles.length, current: 0, filename: '準備中...' });

    try {
      const allRecords: ExtractedRecord[] = [];
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        setStatus({ total: pendingFiles.length, current: i, filename: file.name });

        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
           const pages = await convertPdfToImages(file);
           for (const page of pages) {
             const res = await extractDataFromDocument({
               base64Image: page.base64,
               textContent: page.textContent,
               fileName: file.name,
               pageNumber: page.pageNumber
             });
             allRecords.push(...res);
             setRecords(prev => [...prev, ...res]);
           }
        } else if (file.name.endsWith('.docx')) {
           const textContent = await extractTextFromDocx(file);
           const res = await extractDataFromDocument({ textContent, fileName: file.name, pageNumber: 1 });
           allRecords.push(...res);
           setRecords(prev => [...prev, ...res]);
        }
        setStatus({ total: pendingFiles.length, current: i + 1, filename: file.name });
      }

      const nameCounts: Record<string, number> = {};
      allRecords.forEach(r => {
        const n = r.name.trim();
        if (n) nameCounts[n] = (nameCounts[n] || 0) + 1;
      });
      setDuplicateNames(Object.keys(nameCounts).filter(n => nameCounts[n] > 1));
      setAppState(AppState.COMPLETED);
    } catch (err: any) {
      setAppState(AppState.ERROR);
      setErrorMsg(err.message);
    }
  }, [pendingFiles]);

  const handleReset = () => {
    setAppState(AppState.IDLE);
    setRecords([]);
    setPendingFiles([]);
    setErrorMsg(null);
    setStatus(null);
  };

  const handleExportCsv = () => {
    const header = ['單位/職稱', '姓名', '單位主管擬評', '來源檔案'];
    const rows = records.map(r => [`"${r.unitTitle}"`, `"${r.name}"`, `"${r.supervisorRating}"`, `"${r.fileName}"`]);
    const csvContent = '\uFEFF' + [header.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `考績擷取結果_${Date.now()}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-8 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-xl font-bold text-slate-900">考績清冊 AI 擷取</h1>
            <p className="text-xs text-slate-500">智慧辨識姓名與擬評分數</p>
          </div>
          <div className="flex items-center bg-slate-100 px-3 py-1.5 rounded-full">
             <span className={`w-2 h-2 rounded-full mr-2 ${isApiKeyDetected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></span>
             <span className="text-[10px] font-bold text-slate-600">KEY: {isApiKeyDetected ? 'OK' : 'MISSING'}</span>
          </div>
        </header>

        <main className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
          <div className="p-6">
            {(appState === AppState.IDLE || appState === AppState.ERROR) && (
              <div className="space-y-6">
                <DropZone onFilesSelected={handleFilesSelected} disabled={appState === AppState.PROCESSING} />
                
                {appState === AppState.ERROR && (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="bg-red-50 border-2 border-red-200 p-6 rounded-xl">
                      <div className="flex items-center mb-3">
                        <svg className="w-6 h-6 text-red-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <h3 className="text-red-800 font-bold">執行發生錯誤</h3>
                      </div>
                      
                      {errorMsg === "API_KEY_LEAKED" ? (
                        <div className="space-y-4">
                          <p className="text-sm text-red-700 leading-relaxed">
                            <strong>⚠️ 金鑰已洩漏：</strong> 您的 API Key 已被 Google 系統標記為外流並自動停用（這通常是因為金鑰出現在公開的網頁或程式碼中）。
                          </p>
                          <div className="bg-white/50 p-4 rounded-lg text-sm text-red-900 border border-red-100">
                            <p className="font-bold mb-2">如何解決？</p>
                            <ol className="list-decimal pl-5 space-y-1">
                              <li>去 <a href="https://aistudio.google.com/app/apikey" target="_blank" className="underline font-bold text-blue-700">Google AI Studio</a> 建立一組「新的」API Key。</li>
                              <li>在 Vercel 專案的 <b>Settings > Environment Variables</b> 中更新 <code>API_KEY</code>。</li>
                              <li>點擊 Vercel 介面上的 <b>Redeploy</b> 重新部署。</li>
                            </ol>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-red-600 font-mono bg-white/30 p-3 rounded">{errorMsg}</p>
                      )}
                      
                      <button onClick={handleReset} className="mt-6 w-full py-2 bg-red-100 text-red-700 rounded-lg text-sm font-bold hover:bg-red-200 transition-colors">
                        返回重新嘗試
                      </button>
                    </div>
                  </div>
                )}

                {pendingFiles.length > 0 && appState !== AppState.ERROR && (
                  <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 flex flex-col items-center">
                    <p className="text-sm text-blue-800 font-medium mb-4">已準備好 {pendingFiles.length} 個檔案</p>
                    <button 
                      onClick={handleStartProcessing} 
                      className="w-full sm:w-64 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all"
                    >
                      開始執行 AI 擷取
                    </button>
                  </div>
                )}
              </div>
            )}

            {appState === AppState.PROCESSING && status && (
              <div className="py-10">
                <ProgressBar current={status.current} total={status.total} filename={status.filename} />
              </div>
            )}

            {appState === AppState.COMPLETED && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-green-50 p-5 rounded-2xl border border-green-200 gap-4">
                  <div>
                    <span className="text-green-800 font-bold block">✓ 擷取完成</span>
                    <span className="text-xs text-green-600">共分析出 {records.length} 筆資料</span>
                  </div>
                  <div className="flex w-full sm:w-auto gap-2">
                    <button onClick={handleExportCsv} className="flex-1 sm:flex-none px-6 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-md">匯出 CSV</button>
                    <button onClick={handleReset} className="flex-1 sm:flex-none px-6 py-2 bg-white border border-slate-200 text-slate-500 rounded-lg text-sm hover:bg-slate-50">重啟</button>
                  </div>
                </div>

                {records.length === 0 && (
                  <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                    <div className="text-slate-300 mb-4">
                      <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">找不到人員資料</h3>
                    <p className="text-sm text-slate-500 max-w-xs mx-auto mt-2">
                      請確認 PDF 檔案是否包含考績表格，且字體是否清晰可辨識。
                    </p>
                  </div>
                )}

                {duplicateNames.length > 0 && (
                  <div className="bg-amber-50 p-4 rounded-xl border-l-4 border-amber-400">
                    <p className="text-xs font-bold text-amber-800 flex items-center mb-1">
                      <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      同名同姓警示
                    </p>
                    <p className="text-[11px] text-amber-700">重複姓名：{duplicateNames.join(', ')}。匯入 Excel 時請注意核對單位資訊。</p>
                  </div>
                )}
                
                <ResultList records={records} />
              </div>
            )}
          </div>
        </main>

        <footer className="mt-12 text-center text-slate-400 text-[10px]">
          <p>© 2025 考績自動化擷取工具 - Power by Gemini 3.0</p>
        </footer>
      </div>
    </div>
  );
};

export default App;