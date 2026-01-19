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

  // 偵測 API Key 是否正確注入（檢查長度與是否為佔位符）
  const apiKeyStatus = useMemo(() => {
    const key = process.env.API_KEY;
    if (!key || key.length < 10) return 'missing';
    if (key.includes('process.env')) return 'unconfigured';
    return 'valid';
  }, []);

  const handleFilesSelected = useCallback((files: File[]) => {
    setPendingFiles(files);
    setRecords([]);
    setErrorMsg(null);
    setAppState(AppState.IDLE);
  }, []);

  const handleStartProcessing = useCallback(async () => {
    if (pendingFiles.length === 0) return;
    
    if (apiKeyStatus !== 'valid') {
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
            <p className="text-sm text-slate-500">自動化整理擬評分數，提升行政效率</p>
          </div>
          <div className="flex flex-col items-end">
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-[10px] font-bold ${apiKeyStatus === 'valid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              <span className={`w-2 h-2 rounded-full ${apiKeyStatus === 'valid' ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></span>
              <span>API KEY: {apiKeyStatus === 'valid' ? '已啟動' : '未設定'}</span>
            </div>
            {apiKeyStatus !== 'valid' && <span className="text-[10px] text-red-400 mt-1">請更新 Vercel 設定並 Redeploy</span>}
          </div>
        </header>

        <main className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="p-8">
            {(appState === AppState.IDLE || appState === AppState.ERROR) && (
              <div className="space-y-8">
                <DropZone onFilesSelected={handleFilesSelected} disabled={appState === AppState.PROCESSING} />
                
                {appState === AppState.ERROR && (
                  <div className="bg-red-50 border border-red-200 p-6 rounded-2xl">
                    <div className="flex items-start">
                      <div className="bg-red-100 p-2 rounded-lg mr-4">
                        <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-red-800 font-bold text-lg mb-2">無法開始處理</h3>
                        
                        {(errorMsg === "API_KEY_LEAKED" || errorMsg === "API_KEY_NOT_SET") ? (
                          <div className="space-y-4">
                            <p className="text-sm text-red-700 leading-relaxed">
                              {errorMsg === "API_KEY_LEAKED" ? "目前的 API Key 已因洩漏被 Google 停用。" : "尚未偵測到有效的 API Key。"}
                            </p>
                            <div className="bg-white p-4 rounded-xl border border-red-100 text-xs text-slate-700 shadow-sm">
                              <p className="font-bold text-slate-900 mb-2 underline">修復指南：</p>
                              <ol className="list-decimal pl-5 space-y-2">
                                <li>進入 <b>Vercel Dashboard</b> 點選本專案。</li>
                                <li>點擊 <b>Settings > Environment Variables</b>。</li>
                                <li>新增 <code>API_KEY</code>，貼上您的新金鑰。</li>
                                <li><b>最重要：</b>至 <b>Deployments</b> 找到最新一筆，點擊 <b>Redeploy</b>。</li>
                              </ol>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-red-600 font-mono bg-white/50 p-3 rounded-lg border border-red-100">{errorMsg}</p>
                        )}
                        
                        <button onClick={handleReset} className="mt-6 text-sm font-bold text-red-600 hover:text-red-800 underline transition-colors">
                          ← 返回重新上傳
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {pendingFiles.length > 0 && appState !== AppState.ERROR && (
                  <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 flex flex-col items-center animate-in fade-in zoom-in duration-300">
                    <div className="flex items-center mb-4">
                      <div className="flex -space-x-2 mr-3">
                        {pendingFiles.slice(0, 3).map((_, i) => (
                          <div key={i} className="w-8 h-8 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center text-[10px] text-white font-bold">PDF</div>
                        ))}
                      </div>
                      <p className="text-sm text-blue-800 font-semibold">已準備好 {pendingFiles.length} 個檔案</p>
                    </div>
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
                      <span className="text-xs text-green-700">成功擷取 {records.length} 筆清單資料</span>
                    </div>
                  </div>
                  <div className="flex w-full sm:w-auto gap-2">
                    <button onClick={handleExportCsv} className="flex-1 sm:flex-none px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 shadow-lg shadow-green-100 transition-all active:scale-95">匯出 CSV</button>
                    <button onClick={handleReset} className="flex-1 sm:flex-none px-6 py-3 bg-white border border-slate-200 text-slate-500 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">重啟</button>
                  </div>
                </div>

                {records.length === 0 ? (
                  <div className="text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                    <div className="text-slate-300 mb-4 scale-150">🌫️</div>
                    <h3 className="text-lg font-bold text-slate-800">無資料可呈現</h3>
                    <p className="text-sm text-slate-500 mt-2">請確認上傳的檔案內容是否清晰，且包含考績表格。</p>
                  </div>
                ) : (
                  <>
                    {duplicateNames.length > 0 && (
                      <div className="bg-amber-50 p-4 rounded-xl border-l-4 border-amber-400 flex items-start">
                        <span className="mr-2 text-amber-500">⚠️</span>
                        <div>
                          <p className="text-xs font-bold text-amber-800">同名同姓警告：{duplicateNames.join(', ')}</p>
                          <p className="text-[10px] text-amber-700">這些姓名在不同檔案或頁面中出現多次，請在 Excel 整理時特別留意。</p>
                        </div>
                      </div>
                    )}
                    <ResultList records={records} />
                  </>
                )}
              </div>
            )}
          </div>
        </main>

        <footer className="mt-12 text-center text-slate-400 text-[10px] space-y-2">
          <p>本工具僅供內部行政效率提升使用，資料處理於瀏覽器端完成。</p>
          <p>© 2025 考績自動化擷取系統 · 採用 Gemini 3.0 Flash</p>
        </footer>
      </div>
    </div>
  );
};

export default App;