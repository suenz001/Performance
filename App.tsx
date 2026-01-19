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

  // 檢查 API 金鑰是否存在於環境變數
  const isApiKeyDetected = useMemo(() => {
    return !!process.env.API_KEY && process.env.API_KEY.length > 5;
  }, []);

  const handleFilesSelected = useCallback((files: File[]) => {
    setPendingFiles(files);
    setRecords([]);
    setErrorMsg(null);
    setDuplicateNames([]);
    setAppState(AppState.IDLE);
    setStatus(null);
  }, []);

  const handleStartProcessing = useCallback(async () => {
    if (pendingFiles.length === 0) return;

    if (!isApiKeyDetected) {
      setAppState(AppState.ERROR);
      setErrorMsg("偵測不到有效的 API 金鑰！\n\n1. 請確認 Vercel 環境變數 API_KEY 是否正確。\n2. 設定後請務必點擊 Redeploy 重新部署。");
      return;
    }

    setAppState(AppState.PROCESSING);
    setRecords([]);
    setDuplicateNames([]);
    setErrorMsg(null);
    setStatus({ total: pendingFiles.length, current: 0, filename: '載入中...' });

    const allRecords: ExtractedRecord[] = [];
    
    try {
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        setStatus({ total: pendingFiles.length, current: i, filename: file.name });

        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
           const pages = await convertPdfToImages(file);
           if (pages.length === 0) console.warn(`檔案 ${file.name} 解析出 0 頁。`);
           
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
        } else if (file.name.endsWith('.docx')) {
           const textContent = await extractTextFromDocx(file);
           const docxRecords = await extractDataFromDocument({
             textContent,
             fileName: file.name,
             pageNumber: 1
           });
           allRecords.push(...docxRecords);
           setRecords(prev => [...prev, ...docxRecords]);
        }
        setStatus({ total: pendingFiles.length, current: i + 1, filename: file.name });
      }

      // 重複人名偵測
      const nameCounts: Record<string, number> = {};
      allRecords.forEach(r => {
        const n = r.name.trim();
        if (n) nameCounts[n] = (nameCounts[n] || 0) + 1;
      });
      setDuplicateNames(Object.keys(nameCounts).filter(n => nameCounts[n] > 1));
      
      setAppState(AppState.COMPLETED);
    } catch (err: any) {
      console.error("Processing Loop Error:", err);
      setAppState(AppState.ERROR);
      setErrorMsg(err.message || "發生未知錯誤。");
    }
  }, [pendingFiles, isApiKeyDetected]);

  const handleReset = useCallback(() => {
    setAppState(AppState.IDLE);
    setRecords([]);
    setPendingFiles([]);
    setDuplicateNames([]);
    setErrorMsg(null);
    setStatus(null);
  }, []);

  const downloadFile = (content: string, extension: string, type: string) => {
    const blob = new Blob([content], { type: type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `performance_export_${Date.now()}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const header = ['單位/職稱', '姓名', '單位主管擬評', '來源檔案'];
    const rows = records.map(r => [`"${r.unitTitle}"`, `"${r.name}"`, `"${r.supervisorRating}"`, `"${r.fileName}"`]);
    const csvContent = '\uFEFF' + [header.join(','), ...rows.map(row => row.join(','))].join('\n');
    downloadFile(csvContent, 'csv', 'text/csv;charset=utf-8');
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-start mb-10">
          <div className="text-left">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">考績評分清冊擷取工具</h1>
            <p className="text-slate-600">透過 AI 自動化整理考績名單，解決繁瑣的人工作業。</p>
          </div>
          <div className="flex items-center bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-200 text-xs font-medium">
            <span className={`w-2 h-2 rounded-full mr-2 ${isApiKeyDetected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></span>
            API 狀態: {isApiKeyDetected ? '已連線' : '未設定'}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 border border-slate-100">
          {(appState === AppState.IDLE || appState === AppState.ERROR) && (
            <div className="space-y-6">
              <DropZone onFilesSelected={handleFilesSelected} disabled={appState === AppState.PROCESSING} />
              {pendingFiles.length > 0 && (
                <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                  <h3 className="font-semibold text-slate-800 mb-4">待處理檔案 ({pendingFiles.length})</h3>
                  <ul className="space-y-2 mb-6 max-h-40 overflow-y-auto">
                    {pendingFiles.map((file, idx) => (
                      <li key={idx} className="text-sm text-slate-600 flex items-center bg-white p-2 rounded border border-slate-100">
                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mr-3"></span>{file.name}
                      </li>
                    ))}
                  </ul>
                  <button onClick={handleStartProcessing} className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 shadow-md transition-all active:scale-[0.98]">
                    開始擷取資料
                  </button>
                </div>
              )}
            </div>
          )}

          {appState === AppState.PROCESSING && status && (
            <div className="py-8"><ProgressBar current={status.current} total={status.total} filename={status.filename} /></div>
          )}

          {appState === AppState.ERROR && (
            <div className="bg-red-50 border border-red-200 p-6 rounded-xl mt-6">
              <h3 className="text-red-800 font-bold mb-2">無法執行！</h3>
              <p className="text-sm text-red-700 whitespace-pre-wrap font-mono mb-4">{errorMsg}</p>
              <button onClick={handleReset} className="text-sm font-bold text-red-600 hover:underline">返回重試</button>
            </div>
          )}

          {appState === AppState.COMPLETED && (
            <div>
              {records.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                  <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="text-lg font-bold text-slate-800">未擷取到任何資料 (0 筆)</h3>
                  <p className="text-sm text-slate-500 mt-2 px-6">
                    可能是 PDF 檔案過於模糊、並非標準表格格式，或是 AI 判斷該頁不含考績資料。<br/>
                    建議檢查 PDF 是否有文字層，或確保表格內容清晰。
                  </p>
                  <button onClick={handleReset} className="mt-6 px-6 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium">重新嘗試</button>
                </div>
              ) : (
                <div className="flex flex-col space-y-4">
                  <div className="flex justify-between items-center bg-green-50 p-4 rounded-xl border border-green-200">
                    <span className="text-green-800 font-medium">✓ 擷取完成！共找到 {records.length} 筆人員資料。</span>
                    <button onClick={handleReset} className="text-sm text-green-700 font-bold hover:underline">重新處理</button>
                  </div>
                  {duplicateNames.length > 0 && (
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded shadow-sm">
                      <p className="text-sm font-bold text-yellow-800 mb-1">⚠️ 注意：發現同名同姓人員</p>
                      <p className="text-xs text-yellow-700">以下人員出現多次，Excel 查表時請手動核對：{duplicateNames.join('、')}</p>
                    </div>
                  )}
                  <div className="flex justify-end space-x-3">
                    <button onClick={handleExportCsv} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium bg-white hover:bg-slate-50">匯出 CSV</button>
                  </div>
                  <ResultList records={records} />
                </div>
              )}
            </div>
          )}
        </div>
        
        {appState === AppState.IDLE && (
          <div className="mt-10 p-6 bg-blue-50 rounded-2xl border border-blue-100">
            <h4 className="text-sm font-bold text-blue-800 mb-2">💡 小撇步：</h4>
            <ul className="text-xs text-blue-700 space-y-1.5 list-disc pl-4">
              <li>如果是掃描檔 (圖片組成的 PDF)，系統會自動進行 OCR 辨識。</li>
              <li>如果是 Word 轉 PDF，擷取精度會更高且速度更快。</li>
              <li>若在 Vercel 失敗，請確認 <b>Redeploy</b> 流程已完成。</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;