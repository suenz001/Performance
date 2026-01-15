import React from 'react';
import { ExtractedRecord } from '../types';

interface ResultListProps {
  records: ExtractedRecord[];
}

const ResultList: React.FC<ResultListProps> = ({ records }) => {
  if (records.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center">
        <span className="bg-blue-100 text-blue-700 p-1.5 rounded-lg mr-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </span>
        已擷取資料 ({records.length} 筆)
      </h2>
      
      <div className="overflow-hidden shadow-sm ring-1 ring-black ring-opacity-5 rounded-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-300">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-slate-900 sm:pl-6">單位 / 職稱</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">姓名</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">單位主管擬評</th>
                <th scope="col" className="px-3 py-3.5 text-right text-xs font-medium text-slate-500">來源檔案</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-slate-900 sm:pl-6">
                    {record.unitTitle}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-700">
                    {record.name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-700 font-mono">
                    {record.supervisorRating}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-right text-xs text-slate-400">
                    {record.fileName} (第 {record.pageNumber} 頁)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ResultList;