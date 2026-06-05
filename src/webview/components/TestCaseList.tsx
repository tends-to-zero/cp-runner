import React from 'react';
import { TestCase, RunnerConfig } from '../types';
import { TestCaseCard } from './TestCaseCard';

interface TestCaseListProps {
  testCases: TestCase[];
  expandedCards: Record<string, boolean>;
  config: RunnerConfig;
  addTestCase: () => void;
  updateTestCase: (id: string, updatedFields: Partial<TestCase>) => void;
  deleteTestCase: (id: string) => void;
  toggleCard: (id: string) => void;
  compilationError?: string;
  compileErrDismissed: boolean;
  setCompileErrDismissed: (dismissed: boolean) => void;
}

export const TestCaseList: React.FC<TestCaseListProps> = ({
  testCases,
  expandedCards,
  config,
  addTestCase,
  updateTestCase,
  deleteTestCase,
  toggleCard,
  compilationError,
  compileErrDismissed,
  setCompileErrDismissed,
}) => {
  return (
    <>
      {compilationError && !compileErrDismissed && (
        <div className="bg-red-950/30 border border-red-500/25 rounded-lg p-2.5 font-mono text-[10.5px] text-red-300 select-text">
          <div className="flex items-center justify-between border-b border-red-500/15 pb-1 mb-1.5">
            <span className="font-bold text-[10px] uppercase tracking-wider text-red-400">⚠ Compilation Failed</span>
            <button
              onClick={() => setCompileErrDismissed(true)}
              className="text-red-500 hover:text-red-300 transition-colors text-xs leading-none px-1"
              title="Dismiss"
            >✕</button>
          </div>
          <pre className="whitespace-pre-wrap leading-relaxed">{compilationError}</pre>
        </div>
      )}

      <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Test Cases ({testCases.length})</h2>
        <button
          onClick={addTestCase}
          className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 font-semibold border border-white/5 transition-all text-white flex items-center gap-1"
        >
          <span>+</span> Add
        </button>
      </div>

      <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
        {testCases.map((test, index) => (
          <TestCaseCard
            key={test.id}
            test={test}
            index={index}
            isExpanded={expandedCards[test.id] === true}
            config={config}
            toggleCard={toggleCard}
            updateTestCase={updateTestCase}
            deleteTestCase={deleteTestCase}
          />
        ))}

        {testCases.length === 0 && (
          <div className="glass-card rounded-xl p-5 text-center border border-dashed border-white/10 space-y-1.5">
            <svg className="w-6 h-6 text-zinc-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <div className="text-zinc-400 font-bold text-xs">No Test Cases</div>
            <div className="text-[10px] text-zinc-500">Click "+ Add" to add test inputs.</div>
          </div>
        )}
      </div>
    </>
  );
};
