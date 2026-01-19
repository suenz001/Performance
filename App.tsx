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

  // 偵測 API Key 是否正確注入
  const apiKeyStatus = useMemo(() => {
    const key = process.env.API_KEY;
    if (!key || key.length < 10 || key.includes('process.env')) return 'missing';
    return 'configured';
  }, []);

  const handleFilesSelected = useCallback((files: File[]) => {
    setPendingFiles(files);
    setRecords([]);
    setErrorMsg(null);
    setAppState(AppState.IDLE);
  }, []);

  const handleStartProcessing = useCallback(async () => {
    if (pendingFiles.length === 0) return;
    
    if (apiKeyStatus !== 'configured') {
      setAppState(AppState.ERROR);
      setErrorMsg("API_KEY_NOT_SET");
      return;
    }

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
  }, [pendingFiles, apiKeyStatus]);

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
    link.download = `考績結果_${Date.now()}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-6 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">考績清冊 AI 擷取</h1>
            <p className="text-sm text-slate-500">智慧整理拟評分數</p>
          </div>
          <div className="flex flex-col items-end">
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-[10px] font-bold ${apiKeyStatus === 'configured' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              <span className={`w-2 h-2 rounded-full ${apiKeyStatus === 'configured' ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></span>
              <span>API KEY: {apiKeyStatus === 'configured' ? '環境變數已讀取' : '未設定'}</span>
            </div>
          </div>
        </header>

        <main className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="p-8">
            {(appState === AppState.IDLE || appState === AppState.ERROR) && (
              <div className="space-y-8">
                <DropZone onFilesSelected={handleFilesSelected} disabled={appState === AppState.PROCESSING} />
                
                {appState === AppState.ERROR && (
                  <div className="bg-red-50 border-2 border-red-200 p-6 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-start">
                      <div className="bg-red-100 p-2 rounded-lg mr-4 text-red-600">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-red-900 font-extrabold text-lg mb-2">
                          {errorMsg === "API_KEY_INVALID" ? "API 金鑰已失效 (Expired)" : "系統執行錯誤"}
                        </h3>
                        
                        <div className="text-sm text-red-800 space-y-3 leading-relaxed">
                          {errorMsg === "API_KEY_INVALID" ? (
                            <>
                              <p>檢測到您的 API 金鑰已失效。這通常是因為金鑰被公開分享（如貼在聊天室）而被 Google 自動停用。</p>
                              <div className="bg-white/60 p-4 rounded-xl border border-red-100 text-xs text-slate-700">
                                <p className="font-bold text-red-900 mb-2">解決步驟：</p>
                                <ol className="list-decimal pl-5 space-y-1">
                                  <li>去 <a href="https://aistudio.google.com/app/apikey" target="_blank" className="underline font-bold text-blue-600">AI Studio</a> 生一個「全新」金鑰。</li>
                                  <li>回到 Vercel 專案，在 <b>Settings > Environment Variables</b> 更新 <code>API_KEY</code>。</li>
                                  <li><b>最關鍵：</b>到 <b>Deployments</b> 找到最新紀錄，點選 <b>Redeploy</b>。</li>
                                </ol>
                              </div>
                            </>
                          ) : (
                            <p className="font-mono bg-white/40 p-3 rounded border border-red-100">{errorMsg}</p>
                          )}
                        </div>
                        
                        <button onClick={handleReset} className="mt-6 px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-all active:scale-95 shadow-lg shadow-red-100">
                          返回重新嘗試
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {pendingFiles.length > 0 && appState !== AppState.ERROR && (
                  <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 flex flex-col items-center">
                    <p className="text-sm text-blue-800 font-bold mb-4">已準備好 {pendingFiles.length} 個檔案</p>
                    <button 
                      onClick={handleStartProcessing} 
                      className="w-full sm:w-64 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-200 hover:bg-blue-700 hover:-translate-y-0.5 active:translate-y-0 transition-all"
                    >
                      開始執行 AI 辨識
                    </button>
                  </div>
                )}
              </div>
            )}

            {appState === AppState.PROCESSING && status && (
              <div className="py-12">
                <ProgressBar current={status.current} total={status.total} filename={status.filename} />
              </div>
            )}

            {appState === AppState.COMPLETED && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-green-50 p-6 rounded-2xl border border-green-200 gap-4">
                  <div className="flex items-center">
                    <div className="bg-green-100 p-2 rounded-full mr-3 text-green-600">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <span className="text-green-900 font-extrabold block">辨識完成</span>
                      <span className="text-xs text-green-700">共擷取 {records.length} 筆資料</span>
                    </div>
                  </div>
                  <div className="flex w-full sm:w-auto gap-2">
                    <button onClick={handleExportCsv} className="flex-1 sm:flex-none px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 shadow-lg shadow-green-100 transition-all">匯出 CSV</button>
                    <button onClick={handleReset} className="flex-1 sm:flex-none px-6 py-3 bg-white border border-slate-200 text-slate-500 rounded-xl text-sm font-medium hover:bg-slate-50">重啟</button>
                  </div>
                </div>
                <ResultList records={records} />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;