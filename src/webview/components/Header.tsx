import React from 'react';

interface Stats {
  passed: number;
  failed: number;
  tle: number;
  mle: number;
  rte: number;
  compError: number;
  total: number;
}

interface HeaderProps {
  activeFile: string;
  isConfigOpen: boolean;
  setIsConfigOpen: (open: boolean) => void;
  running: boolean;
  triggerStop: () => void;
  triggerRunAll: () => void;
  testCasesCount: number;
  stats: Stats;
}

export const Header: React.FC<HeaderProps> = ({
  activeFile,
  isConfigOpen,
  setIsConfigOpen,
  running,
  triggerStop,
  triggerRunAll,
  testCasesCount,
  stats,
}) => {
  return (
    <div className="glass-card rounded-xl p-2.5 xs:p-3 flex flex-col space-y-2 shadow-lg relative overflow-hidden border border-white/5">
      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-xl pointer-events-none"></div>
      <div className="flex flex-wrap items-center justify-between gap-2 z-10">
        <div className="min-w-0 max-w-full">
          <h1 className="text-xs font-bold tracking-wider text-white flex items-center gap-1.5 font-sans uppercase">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
            CP Runner
          </h1>
          <p className="text-[9px] text-zinc-400 font-mono mt-0.5 max-w-full truncate" title={activeFile}>
            {activeFile}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className={`p-2 rounded-lg hover:bg-white/5 border border-white/5 transition-all ${isConfigOpen ? 'bg-white/10 text-white border-white/10' : 'text-zinc-400'}`}
            title="Toggle Configuration"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          {running ? (
            <button
              onClick={triggerStop}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition-all shadow-[0_0_15px_rgba(225,29,72,0.4)] flex items-center gap-1.5 text-xs"
            >
              <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>
              Stop
            </button>
          ) : (
            <button
              onClick={triggerRunAll}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center gap-1.5 text-xs"
              disabled={testCasesCount === 0}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              Run All
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 font-mono text-[10px] mt-1">
        {[
          { label: 'PASS', val: stats.passed, color: 'text-emerald-400', bg: 'bg-emerald-950/20 border-emerald-500/15' },
          { label: 'FAIL', val: stats.failed, color: 'text-rose-400',    bg: 'bg-rose-950/20 border-rose-500/15' },
          { label: 'TLE',  val: stats.tle,    color: 'text-amber-400',   bg: 'bg-amber-950/20 border-amber-500/15' },
          { label: 'MLE',  val: stats.mle,    color: 'text-orange-400',  bg: 'bg-orange-950/20 border-orange-500/15' },
          { label: 'RTE',  val: stats.rte,    color: 'text-purple-400',  bg: 'bg-purple-950/20 border-purple-500/15' },
        ].map(s => (
          <div key={s.label} className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${s.bg}`}>
            <span className="text-zinc-500">{s.label}</span>
            <span className={`font-bold ${s.color}`}>{s.val}</span>
          </div>
        ))}
        <div className="ml-auto text-zinc-500">{stats.total} test{stats.total !== 1 ? 's' : ''}</div>
      </div>
    </div>
  );
};
