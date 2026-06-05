import React from 'react';
import { TestCase, RunnerConfig } from '../types';

interface TestCaseCardProps {
  test: TestCase;
  index: number;
  isExpanded: boolean;
  config: RunnerConfig;
  toggleCard: (id: string) => void;
  updateTestCase: (id: string, updatedFields: Partial<TestCase>) => void;
  deleteTestCase: (id: string) => void;
}

export const TestCaseCard: React.FC<TestCaseCardProps> = ({
  test,
  index,
  isExpanded,
  config,
  toggleCard,
  updateTestCase,
  deleteTestCase,
}) => {
  const statusBadge = () => {
    switch (test.status) {
      case 'Passed':
        return <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono font-semibold border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">PASSED</span>;
      case 'Failed':
        return <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 font-mono font-semibold border border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]">FAILED</span>;
      case 'Running':
        return (
          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 font-mono font-semibold border border-blue-500/20 flex items-center gap-1 shadow-[0_0_10px_rgba(59,130,246,0.1)]">
            <svg className="animate-spin h-2.5 w-2.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            RUNNING
          </span>
        );
      case 'Compiling':
        return <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-400 font-mono font-semibold border border-indigo-500/20 animate-pulse">COMPILING</span>;
      case 'TLE':
        return <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 font-mono font-semibold border border-amber-500/20">TLE</span>;
      case 'MLE':
        return <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/15 text-orange-400 font-mono font-semibold border border-orange-500/20">MLE</span>;
      case 'RTE':
        return <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 font-mono font-semibold border border-purple-500/20">RTE</span>;
      case 'CompilationError':
        return <span className="text-[10px] px-2 py-0.5 rounded bg-red-600/25 text-red-300 font-mono font-semibold border border-red-500/20">COMPILE ERR</span>;
      default:
        return <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono font-semibold border border-white/5">IDLE</span>;
    }
  };

  return (
    <div className={`glass-card rounded-xl border transition-all ${
      test.status === 'Passed' ? 'border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.03)]' :
      test.status === 'Failed' ? 'border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.03)]' :
      test.status === 'Running' ? 'border-blue-500/25 bg-blue-500/[0.01]' : 'border-white/5'
    }`}>
      <div
        onClick={() => toggleCard(test.id)}
        className="flex items-center gap-1.5 px-2.5 py-2 cursor-pointer hover:bg-white/[0.02] transition-all rounded-t-xl"
      >
        <svg className={`w-3 h-3 text-zinc-500 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-bold text-white text-[11px] truncate">Test #{index + 1}</span>
        {statusBadge()}
        {test.executionTime !== undefined && test.executionTime > 0 && (
          <span className="font-mono text-[9px] text-zinc-500 px-1 py-0.5 rounded bg-zinc-900/80 border border-white/5">{test.executionTime}ms</span>
        )}
        {test.memoryUsage !== undefined && test.memoryUsage > 0 && (
          <span className="font-mono text-[9px] text-zinc-500 px-1 py-0.5 rounded bg-zinc-900/80 border border-white/5">{test.memoryUsage}MB</span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteTestCase(test.id);
          }}
          className="ml-auto p-0.5 hover:text-rose-400 hover:bg-white/5 rounded transition-all shrink-0"
          title="Delete Test Case"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {isExpanded && (
        <div className="px-2.5 pb-2.5 pt-0 border-t border-white/5 space-y-2 font-sans text-xs">
          {test.status === 'RTE' && test.errorMessage && (
            <div className="mt-2 bg-purple-950/20 border border-purple-500/20 p-2 rounded-lg text-purple-300 font-mono text-[10px] whitespace-pre-wrap select-text">
              <div className="font-bold border-b border-purple-500/10 pb-0.5 mb-1 text-[9.5px] uppercase tracking-wider">Runtime Error:</div>
              {test.errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 mt-2">
            <div className="flex flex-col space-y-0.5">
              <span className="text-[9.5px] text-zinc-500 font-bold uppercase tracking-wider">Input</span>
              <textarea
                value={test.input}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateTestCase(test.id, { input: e.target.value })}
                className="w-full bg-zinc-950/70 border border-white/5 rounded-lg p-2 font-mono text-white focus:outline-none focus:border-blue-500/50 resize-y h-24 min-h-[60px] select-text scrollbar-none"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', fontSize: `${config.fontSize || 12}px` }}
                placeholder="stdin..."
              />
            </div>
            <div className="flex flex-col space-y-0.5">
              <span className="text-[9.5px] text-zinc-500 font-bold uppercase tracking-wider">Expected</span>
              <textarea
                value={test.expectedOutput}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateTestCase(test.id, { expectedOutput: e.target.value })}
                className="w-full bg-zinc-950/70 border border-white/5 rounded-lg p-2 font-mono text-white focus:outline-none focus:border-blue-500/50 resize-y h-24 min-h-[60px] select-text scrollbar-none"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', fontSize: `${config.fontSize || 12}px` }}
                placeholder="expected stdout..."
              />
            </div>
          </div>

          {(test.status === 'TLE' || test.status === 'MLE') && test.errorMessage && (
            <div className={`p-2 rounded-lg font-mono text-[10px] whitespace-pre-wrap select-text border ${
              test.status === 'TLE'
                ? 'bg-amber-950/20 border-amber-500/20 text-amber-300'
                : 'bg-orange-950/20 border-orange-500/20 text-orange-300'
            }`}>
              <div className="font-bold text-[9.5px] uppercase tracking-wider border-b border-current/10 pb-0.5 mb-1 opacity-70">
                {test.status === 'TLE' ? 'Time Limit Exceeded:' : 'Memory Limit Exceeded:'}
              </div>
              {test.errorMessage}
            </div>
          )}

          {test.status !== 'Idle' && test.status !== 'Compiling' && test.status !== 'CompilationError' && (
            <div className="flex flex-col space-y-0.5 border-t border-white/5 pt-2">
              <span className="text-[9.5px] text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                Actual Output
                {test.status === 'Running' && (
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping"></span>
                )}
              </span>
              <pre className="bg-zinc-950/90 border border-white/5 rounded-lg p-2 font-mono text-zinc-200 overflow-x-auto whitespace-pre-wrap min-h-[24px] max-h-32 select-text"
                   style={{ fontSize: `${config.fontSize || 12}px` }}>
                {test.actualOutput || (test.status === 'Running' ? 'Executing...' : 'No output.')}
              </pre>
            </div>
          )}

          {test.status !== 'Idle' && test.status !== 'Compiling' && test.status !== 'CompilationError' && test.stderrOutput && (
            <div className="flex flex-col space-y-0.5 border-t border-white/5 pt-2">
              <span className="text-[9.5px] text-purple-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                Standard Error (cerr)
              </span>
              <pre className="bg-zinc-950/90 border border-purple-500/10 rounded-lg p-2 font-mono text-purple-300 overflow-x-auto whitespace-pre-wrap max-h-32 select-text"
                   style={{ fontSize: `${config.fontSize || 12}px` }}>
                {test.stderrOutput}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
