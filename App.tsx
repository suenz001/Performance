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

  // 取得遮罩後的金鑰用於除錯
  const maskedApiKey = useMemo(() => {
    const key = process.env.API_KEY;
    if (!key || key === 'undefined' || key.length < 10) return "未設定或讀取失敗";
    // 顯示前5碼與後5碼，方便使用者對照 AI Studio 上的內容
    return `${key.substring(0, 5)}....${key.substring(key.length - 5)}`;
  }, []);

  const apiKeyStatus = useMemo(() => {
    const key = process.env.API_KEY;
    if (!key || key === 'undefined' || key.length < 10 || key.includes('process.env')) {
      return 'missing';
    }
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
      console.error("Catching App Error:", err);
      setAppState(AppState.ERROR);
      setErrorMsg(err.message || "發生未知錯誤");
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

  const handleExportTxt = () => {
    const content = records.map(r => 
      `單位/職稱: ${r.unitTitle} | 姓名: ${r.name} | 單位主管擬評: ${r.supervisorRating} | 來源: ${r.fileName} (第 ${r.pageNumber} 頁)`
    ).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `考績結果_${Date.now()}.txt`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 font-sans text-slate-900">
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
                      <div className="flex-1 text-slate-800">
                        <h3 className="text-red-900 font-extrabold text-lg mb-2">
                          系統執行錯誤 (可能是金鑰同步延遲)
                        </h3>
                        
                        <div className="text-sm space-y-4 leading-relaxed">
                          <p className="font-medium">目前的錯誤回報：<span className="text-red-700 bg-red-100 px-2 py-0.5 rounded font-mono">{errorMsg}</span></p>
                          
                          <div className="bg-white/90 p-5 rounded-xl border border-red-200 text-xs text-slate-700 shadow-sm space-y-4">
                            <div className="border-b border-red-100 pb-2">
                              <p className="font-bold text-red-900 flex items-center mb-1 text-sm">
                                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                </svg>
                                排除疑難清單 (必看)
                              </p>
                              <p className="text-slate-500 italic">如果已經更新了金鑰還是失敗，請檢查以下 3 點：</p>
                            </div>

                            <div className="space-y-3">
                              <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                                <p className="font-bold text-amber-900 mb-1">1. 檢查目前讀取到的金鑰片段：</p>
                                <code className="bg-slate-800 text-slate-200 px-3 py-1 rounded select-all font-mono text-sm block w-fit mb-1">{maskedApiKey}</code>
                                <p className="text-slate-600">請核對這前後 5 碼。如果跟你新產生的金鑰「對不起來」，表示 Vercel 還在用舊的代碼。</p>
                              </div>

                              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                                <p className="font-bold text-blue-900 mb-1">2. Vercel Redeploy 重要步驟：</p>
                                <p>在 Vercel 的 Deployments 點選 <b>Redeploy</b> 時，彈出視窗下方有一個選項 <b>"Use existing Build Cache"</b>，請務必<span className="text-red-600 font-bold underline">「取消勾選」</span>再按 Redeploy。</p>
                              </div>

                              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                                <p className="font-bold text-purple-900 mb-1">3. 瀏覽器強迫重新讀取：</p>
                                <p>重新部署完後，請在網頁按下 <kbd className="bg-white px-1 border border-slate-300 rounded shadow-sm">Ctrl</kbd> + <kbd className="bg-white px-1 border border-slate-300 rounded shadow-sm">F5</kbd> 或在手機重新整理，確保瀏覽器快取已被清除。</p>
                              </div>
                            </div>
                          </div>
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
                  <div className="flex flex-wrap w-full sm:w-auto gap-2">
                    <button onClick={handleExportCsv} className="flex-1 sm:flex-none px-4 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 shadow-md transition-all text-sm">匯出 CSV</button>
                    <button onClick={handleExportTxt} className="flex-1 sm:flex-none px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-md transition-all text-sm">匯出 TXT</button>
                    <button onClick={handleReset} className="flex-1 sm:flex-none px-4 py-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl text-sm font-medium hover:bg-slate-50">重啟</button>
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