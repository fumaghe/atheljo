import React from 'react';
import { FileText, Download, Clock, CheckCircle } from 'lucide-react';

const reports = [
  {
    id: '1',
    name: 'Monthly Capacity Report',
    createdAt: '2024-03-10T10:00:00Z',
    format: 'PDF',
    status: 'completed',
    url: '#',
  },
  {
    id: '2',
    name: 'System Performance Analysis',
    createdAt: '2024-03-09T15:30:00Z',
    format: 'XLS',
    status: 'pending',
  },
  // Add more reports as needed
];

export default function Reports() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Reports</h1>
        <button className="bg-[#22c1d4] text-[#06272b] px-4 py-2 rounded-lg font-semibold hover:bg-[#22c1d4]/90 transition-colors">
          Create New Report
        </button>
      </div>

      <div className="bg-[#0b3c43] rounded-lg shadow-lg overflow-hidden">
        <div className="p-6">
          <div className="space-y-4">
            {reports.map((report) => (
              <div 
                key={report.id}
                className="flex items-center justify-between p-4 rounded-lg bg-[#06272b]"
              >
                <div className="flex items-center gap-4">
                  <FileText className="w-6 h-6 text-[#22c1d4]" />
                  <div>
                    <h4 className="font-semibold">{report.name}</h4>
                    <p className="text-sm text-[#eeeeee]/60">
                      Created: {new Date(report.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className={`
                    flex items-center gap-2 px-3 py-1 rounded-full text-sm
                    ${report.status === 'completed' 
                      ? 'bg-[#22c1d4]/20 text-[#22c1d4]' 
                      : 'bg-[#eeeeee]/20 text-[#eeeeee]'}
                  `}>
                    {report.status === 'completed' 
                      ? <CheckCircle className="w-4 h-4" />
                      : <Clock className="w-4 h-4" />
                    }
                    {report.status}
                  </span>
                  <span className="px-3 py-1 bg-[#06272b] rounded-full text-sm">
                    {report.format}
                  </span>
                  {report.status === 'completed' && (
                    <button className="p-2 hover:bg-[#22c1d4]/10 rounded-full transition-colors">
                      <Download className="w-5 h-5 text-[#22c1d4]" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}