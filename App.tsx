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
  const [duplicateNames, setDuplicateNames] = useState<string[]>([]);

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

    // 檢查 API 金鑰是否存在
    if (!process.env.API_KEY) {
      setAppState(AppState.ERROR);
      setErrorMsg("偵測不到 API 金鑰！\n\n1. 請確認已在 Vercel 專案 Settings -> Environment Variables 加入 API_KEY。\n2. 加入後必須「重新部署 (Redeploy)」才會生效。");
      return;
    }

    setAppState(AppState.PROCESSING);
    setRecords([]);
    setDuplicateNames([]);
    setErrorMsg(null);
    setStatus({ total: pendingFiles.length, current: 0, filename: '初始化中...' });

    const allRecords: ExtractedRecord[] = [];
    const files = pendingFiles;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setStatus({ total: files.length, current: i, filename: file.name });

        if (file.name.toLowerCase().endsWith('.doc') && !file.name.toLowerCase().endsWith('.docx')) {
           throw new Error(`不支援 .doc 格式: ${file.name}\n請轉存為 .docx 或 .pdf 後再試一次。`);
        }

        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
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
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
           const textContent = await extractTextFromDocx(file);
           const docxRecords = await extractDataFromDocument({
             textContent: textContent,
             fileName: file.name,
             pageNumber: 1
           });
           allRecords.push(...docxRecords);
           setRecords(prev => [...prev, ...docxRecords]);
        }

        setStatus({ total: files.length, current: i + 1, filename: file.name });
      }

      const nameCounts: Record<string, number> = {};
      allRecords.forEach(record => {
        const name = record.name.trim();
        if (name) nameCounts[name] = (nameCounts[name] || 0) + 1;
      });
      const foundDuplicates = Object.keys(nameCounts).filter(name => nameCounts[name] > 1);
      setDuplicateNames(foundDuplicates);
      setAppState(AppState.COMPLETED);
    } catch (err: any) {
      console.error(err);
      setAppState(AppState.ERROR);
      setErrorMsg(err.message || "發生未知錯誤。");
    }
  }, [pendingFiles]);

  const handleExportTxt = useCallback(() => {
    if (records.length === 0) return;
    const textContent = records.map(r => `${r.unitTitle} ${r.name} ${r.supervisorRating}`).join('\n');
    downloadFile(textContent, 'txt', 'text/plain;charset=utf-8');
  }, [records]);

  const handleExportCsv = useCallback(() => {
    if (records.length === 0) return;
    const header = ['單位/職稱', '姓名', '單位主管擬評', '來源檔案'];
    const rows = records.map(r => [`"${r.unitTitle}"`, `"${r.name}"`, `"${r.supervisorRating}"`, `"${r.fileName}"`]);
    const csvContent = '\uFEFF' + [header.join(','), ...rows.map(row => row.join(','))].join('\n');
    downloadFile(csvContent, 'csv', 'text/csv;charset=utf-8');
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
    setPendingFiles([]);
    setDuplicateNames([]);
    setErrorMsg(null);
    setStatus(null);
  }, []);

  const handleClearPending = useCallback(() => setPendingFiles([]), []);

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight sm:text-4xl mb-2">考績評分清冊擷取工具</h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">支援 PDF 與 Word (.docx) 檔案。透過 AI 自動擷取單位、姓名及主管擬評分數。</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          {(appState === AppState.IDLE || appState === AppState.ERROR) && (
            <div className="space-y-6">
              <DropZone onFilesSelected={handleFilesSelected} disabled={appState === AppState.PROCESSING} />
              {pendingFiles.length > 0 && (
                <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-slate-800">已選擇檔案 ({pendingFiles.length})</h3>
                    <button onClick={handleClearPending} className="text-sm text-red-500 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors">清除全部</button>
                  </div>
                  <ul className="space-y-2 mb-6 max-h-48 overflow-y-auto">
                    {pendingFiles.map((file, idx) => (
                      <li key={idx} className="text-sm text-slate-600 flex items-center bg-white p-2 rounded border border-slate-100">
                        <span className="w-2 h-2 bg-slate-400 rounded-full mr-3"></span>{file.name}
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-center">
                    <button onClick={handleStartProcessing} className="w-full sm:w-auto px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 shadow-md transition-all active:scale-95 flex items-center justify-center">
                      開始擷取資料
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {appState === AppState.PROCESSING && status && (
            <div className="py-8"><ProgressBar current={status.current} total={status.total} filename={status.filename} /></div>
          )}

          {appState === AppState.ERROR && (
            <div className="text-center py-8">
               <div className="bg-red-50 text-red-800 p-6 rounded-xl mb-6 inline-block text-left max-w-xl border border-red-200">
                 <div className="flex items-center mb-3">
                    <svg className="w-6 h-6 mr-2 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="font-bold text-lg">系統發生錯誤</p>
                 </div>
                 <p className="text-sm whitespace-pre-wrap leading-relaxed font-mono bg-white/50 p-3 rounded border border-red-100">{errorMsg}</p>
                 <div className="mt-4 text-xs text-red-700 bg-red-100/50 p-3 rounded">
                    <strong>常見排錯方法：</strong>
                    <ul className="list-disc pl-4 mt-1 space-y-1">
                      <li>檢查 Vercel <b>Environment Variables</b> 是否有設定 <code>API_KEY</code>。</li>
                      <li>設定金鑰後，必須點擊專案的 <b>Deployments</b> -> <b>Redeploy</b>。</li>
                      <li>確認金鑰在 <a href="https://aistudio.google.com/" target="_blank" className="underline font-bold">Google AI Studio</a> 狀態正常。</li>
                    </ul>
                 </div>
               </div>
               <div className="flex justify-center"><button onClick={handleReset} className="text-sm font-medium text-slate-500 hover:text-slate-800 underline">返回重試</button></div>
            </div>
          )}

          {appState === AppState.COMPLETED && (
             <div className="flex flex-col items-center">
                <div className="w-full flex justify-between items-center mb-4 bg-green-50 p-4 rounded-lg border border-green-100">
                  <div className="flex items-center text-green-800">
                     <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                     <span className="font-medium">成功處理 {records.length} 筆資料。</span>
                  </div>
                  <button onClick={handleReset} className="text-sm text-green-700 hover:text-green-900 font-medium underline">重新開始</button>
                </div>
                {duplicateNames.length > 0 && (
                  <div className="w-full mb-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded shadow-sm">
                    <h3 className="text-sm font-medium text-yellow-800">發現同名同姓人員 (Excel VLOOKUP 請注意)</h3>
                    <ul className="list-disc pl-5 mt-2 text-sm text-yellow-700">{duplicateNames.map((name, i) => (<li key={i} className="font-semibold">{name}</li>))}</ul>
                  </div>
                )}
                <div className="w-full flex justify-end gap-3 sticky top-0 z-10 bg-white py-2 border-b border-slate-100 mb-2">
                   <button onClick={handleExportCsv} className="inline-flex items-center px-4 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50">匯出 CSV</button>
                   <button onClick={handleExportTxt} className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">匯出 .txt</button>
                </div>
             </div>
          )}

          {(appState === AppState.COMPLETED || records.length > 0) && <ResultList records={records} />}
        </div>
        
        {appState === AppState.IDLE && (
           <p className="text-center text-xs text-slate-400 mt-8">注意：本應用程式需要設定 <code>API_KEY</code> 環境變數才能使用 Gemini API。</p>
        )}
      </div>
    </div>
  );
};

export default App;