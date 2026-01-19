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

  // 取得遮罩後的金鑰用於除錯
  const maskedApiKey = useMemo(() => {
    const key = process.env.API_KEY;
    if (!key || key === 'undefined' || key.length < 10) return "未設定或讀取失敗";
    return `${key.substring(0, 5)}....${key.substring(key.length - 5)}`;
  }, []);

  const apiKeyStatus = useMemo(() => {
    const key = process.env.API_KEY;
    if (!key || key === 'undefined' || key.length < 10 || key.includes('process.env')) {
      return 'missing';
    }
    return 'configured';
  }, []);

  const handleFilesSelected = useCallback((newFiles: File[]) => {
    setPendingFiles(prev => {
      // 避免重複加入同一個檔案對象
      const existingNames = prev.map(f => f.name + f.size);
      const filteredNewFiles = newFiles.filter(nf => !existingNames.includes(nf.name + nf.size));
      return [...prev, ...filteredNewFiles];
    });
    setErrorMsg(null);
    if (appState === AppState.ERROR || appState === AppState.COMPLETED) {
      setAppState(AppState.IDLE);
    }
  }, [appState]);

  const removeFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setPendingFiles([]);
    setAppState(AppState.IDLE);
  };

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
                
                {pendingFiles.length > 0 && (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold text-slate-700 flex items-center">
                        <svg className="w-4 h-4 mr-1 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                        </svg>
                        待處理檔案 ({pendingFiles.length})
                      </h3>
                      <button 
                        onClick={clearFiles}
                        className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors flex items-center"
                      >
                        <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        清空全部
                      </button>
                    </div>

                    <div className="max-height-[300px] overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-200">
                      {pendingFiles.map((file, idx) => (
                        <div key={`${file.name}-${idx}`} className="group flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-white hover:shadow-md transition-all">
                          <div className="flex items-center min-w-0">
                            <div className="bg-white p-2 rounded-lg mr-3 shadow-sm">
                              {file.name.endsWith('.pdf') ? (
                                <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V6.414A2 2 0 0016.414 5L14 2.586A2 2 0 0012.586 2H9z" /><path d="M3 8a2 2 0 012-2v10h8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                              ) : (
                                <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" /></svg>
                              )}
                            </div>
                            <div className="truncate">
                              <p className="text-sm font-semibold text-slate-700 truncate">{file.name}</p>
                              <p className="text-[10px] text-slate-400 uppercase">{(file.size / 1024).toFixed(0)} KB • {file.name.split('.').pop()}</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => removeFile(idx)}
                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="移除此檔案"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="pt-4 flex flex-col items-center">
                      <button 
                        onClick={handleStartProcessing} 
                        className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-200 hover:bg-blue-700 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center space-x-2"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span>開始執行 AI 辨識 ({pendingFiles.length} 個檔案)</span>
                      </button>
                    </div>
                  </div>
                )}
                
                {appState === AppState.ERROR && (
                  <div className="bg-red-50 border-2 border-red-200 p-6 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-start">
                      <div className="bg-red-100 p-2 rounded-lg mr-4 text-red-600">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div className="flex-1 text-slate-800">
                        <h3 className="text-red-900 font-extrabold text-lg mb-2">系統執行錯誤</h3>
                        <div className="text-sm space-y-4 leading-relaxed">
                          <p className="font-medium">目前的錯誤回報：<span className="text-red-700 bg-red-100 px-2 py-0.5 rounded font-mono">{errorMsg}</span></p>
                          <div className="bg-white/90 p-5 rounded-xl border border-red-200 text-xs text-slate-700 shadow-sm space-y-4">
                            <p className="font-bold text-red-900">除錯診斷：</p>
                            <code className="bg-slate-800 text-slate-200 px-3 py-1 rounded block w-fit font-mono text-sm">{maskedApiKey}</code>
                            <p className="text-slate-500 italic">※ 若金鑰不符，請於 Vercel 更新並「不使用快取」Redeploy。</p>
                          </div>
                        </div>
                        <button onClick={handleReset} className="mt-6 px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-all shadow-lg">返回重新嘗試</button>
                      </div>
                    </div>
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
                    <button onClick={handleReset} className="flex-1 sm:flex-none px-4 py-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl text-sm font-medium hover:bg-slate-50">重置全部</button>
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