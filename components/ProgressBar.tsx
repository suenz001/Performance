import React from 'react';

interface ProgressBarProps {
  current: number;
  total: number;
  filename: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ current, total, filename }) => {
  const percentage = Math.round((current / total) * 100);

  return (
    <div className="w-full max-w-lg mx-auto mt-6">
      <div className="flex justify-between mb-1">
        <span className="text-sm font-medium text-blue-700">處理中...</span>
        <span className="text-sm font-medium text-blue-700">{percentage}%</span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-2.5 mb-2">
        <div 
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out" 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      <p className="text-xs text-slate-500 text-center truncate">
        正在分析 ({current}/{total}): {filename}
      </p>
    </div>
  );
};

export default ProgressBar;