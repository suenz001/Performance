import React, { useCallback, useState } from 'react';

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled: boolean;
}

const DropZone: React.FC<DropZoneProps> = ({ onFilesSelected, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const isValidFile = (file: File) => {
    return (
      file.type === 'application/pdf' || 
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.type === 'application/msword' || // Allow legacy .doc so we can handle it with a message
      file.name.endsWith('.docx') ||
      file.name.endsWith('.doc') ||
      file.name.endsWith('.pdf')
    );
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const validFiles = Array.from(e.dataTransfer.files).filter(isValidFile);
      
      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      } else {
        alert('請上傳有效的 PDF 或 Word (.docx) 檔案。');
      }
    }
  }, [onFilesSelected, disabled]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const validFiles = Array.from(e.target.files).filter(isValidFile);
      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }
    }
  }, [onFilesSelected]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative w-full p-10 border-2 border-dashed rounded-xl transition-all duration-300 ease-in-out text-center
        ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-100 border-slate-300' : 'cursor-pointer'}
        ${isDragging ? 'border-blue-500 bg-blue-50 scale-[1.02]' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}
      `}
    >
      <input
        type="file"
        multiple
        accept=".pdf,.docx,.doc"
        onChange={handleFileInput}
        disabled={disabled}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
      />
      <div className="flex flex-col items-center justify-center space-y-4">
        <div className={`p-4 rounded-full ${isDragging ? 'bg-blue-100' : 'bg-slate-100'}`}>
          <svg
            className={`w-8 h-8 ${isDragging ? 'text-blue-600' : 'text-slate-500'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <div>
          <p className="text-lg font-medium text-slate-700">
            {isDragging ? '放開以已上傳檔案' : '拖放 PDF 或 Word 檔案'}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            支援 .pdf 與 .docx<br/>
            <span className="text-xs text-slate-400">(舊版 .doc 請先轉存為 .docx)</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default DropZone;