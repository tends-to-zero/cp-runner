import React from 'react';
import { RunnerConfig } from '../types';

interface ConfigPanelProps {
  config: RunnerConfig;
  setConfigLocal: (updatedFields: Partial<RunnerConfig>) => void;
  persistConfig: (updatedFields: Partial<RunnerConfig>) => void;
  setIsConfigOpen: (open: boolean) => void;
  onOpenKeybindings: () => void;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
  config,
  setConfigLocal,
  persistConfig,
  setIsConfigOpen,
  onOpenKeybindings,
}) => {
  return (
    <div className="glass-card rounded-xl p-3 xs:p-4 border border-blue-500/10 shadow-lg space-y-4 max-h-[60vh] overflow-y-auto">
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-blue-400">Engine Configuration</h2>
        <button onClick={() => setIsConfigOpen(false)} className="text-zinc-500 hover:text-zinc-300">✕</button>
      </div>

      <div className="pt-1">
        <button
          onClick={onOpenKeybindings}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 hover:text-blue-300 transition-all font-mono text-[11px] group"
        >
          <span className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
            </svg>
            <span className="font-semibold">Customize Run Keyboard Shortcut</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 font-mono text-blue-400">Ctrl+Alt+R</span>
          </span>
          <svg className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      </div>
      <div className="space-y-3 font-mono text-[11px]">
        <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
          <div>
            <label className="block text-zinc-400 mb-1">TIME LIMIT: <span className="text-white font-bold">{config.timeLimit}ms</span></label>
            <input
              type="range"
              min="50"
              max="10000"
              step="50"
              value={config.timeLimit}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfigLocal({ timeLimit: parseInt(e.target.value) })}
              onMouseUp={(e: React.MouseEvent<HTMLInputElement>) => persistConfig({ timeLimit: parseInt(e.currentTarget.value) })}
              onTouchEnd={(e: React.TouchEvent<HTMLInputElement>) => persistConfig({ timeLimit: parseInt(e.currentTarget.value) })}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
          <div>
            <label className="block text-zinc-400 mb-1">MEMORY LIMIT: <span className="text-white font-bold">{config.memoryLimit}MB</span></label>
            <input
              type="range"
              min="16"
              max="2048"
              step="16"
              value={config.memoryLimit}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfigLocal({ memoryLimit: parseInt(e.target.value) })}
              onMouseUp={(e: React.MouseEvent<HTMLInputElement>) => persistConfig({ memoryLimit: parseInt(e.currentTarget.value) })}
              onTouchEnd={(e: React.TouchEvent<HTMLInputElement>) => persistConfig({ memoryLimit: parseInt(e.currentTarget.value) })}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider pb-0.5">Compiler Flags</div>
          <div>
            <label className="block text-zinc-400 mb-0.5">C++ FLAGS</label>
            <input
              type="text"
              value={config.cppFlags}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfigLocal({ cppFlags: e.target.value })}
              onBlur={(e: React.FocusEvent<HTMLInputElement>) => persistConfig({ cppFlags: e.target.value })}
              className="w-full bg-zinc-950/50 border border-white/5 rounded p-1.5 font-mono text-[11px] text-white focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-zinc-400 mb-0.5">C FLAGS</label>
            <input
              type="text"
              value={config.cFlags}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfigLocal({ cFlags: e.target.value })}
              onBlur={(e: React.FocusEvent<HTMLInputElement>) => persistConfig({ cFlags: e.target.value })}
              className="w-full bg-zinc-950/50 border border-white/5 rounded p-1.5 font-mono text-[11px] text-white focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-zinc-400 mb-0.5">JAVA COMPILER FLAGS (javac)</label>
            <input
              type="text"
              value={config.javaFlags}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfigLocal({ javaFlags: e.target.value })}
              onBlur={(e: React.FocusEvent<HTMLInputElement>) => persistConfig({ javaFlags: e.target.value })}
              className="w-full bg-zinc-950/50 border border-white/5 rounded p-1.5 font-mono text-[11px] text-white focus:outline-none focus:border-blue-500/50"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 pt-1 border-t border-white/5">
          <div>
            <label className="block text-zinc-400 mb-1">MAX CONCURRENCY: <span className="text-white font-bold">{config.maxWorkers}</span></label>
            <input
              type="range"
              min="1"
              max="16"
              step="1"
              value={config.maxWorkers}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfigLocal({ maxWorkers: parseInt(e.target.value) })}
              onMouseUp={(e: React.MouseEvent<HTMLInputElement>) => persistConfig({ maxWorkers: parseInt(e.currentTarget.value) })}
              onTouchEnd={(e: React.TouchEvent<HTMLInputElement>) => persistConfig({ maxWorkers: parseInt(e.currentTarget.value) })}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
          <div className="space-y-1.5 flex flex-col justify-end">
            <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
              <input
                type="checkbox"
                checked={config.ignoreTrailingWhitespace}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => persistConfig({ ignoreTrailingWhitespace: e.target.checked })}
                className="rounded border-white/5 bg-zinc-900 text-blue-600 focus:ring-0 focus:ring-offset-0"
              />
              Ignore Whitespace
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
              <input
                type="checkbox"
                checked={config.ignoreSystemLineEndings}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => persistConfig({ ignoreSystemLineEndings: e.target.checked })}
                className="rounded border-white/5 bg-zinc-900 text-blue-600 focus:ring-0 focus:ring-offset-0"
              />
              Ignore \r\n Endings
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
          <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
            <input
              type="checkbox"
              checked={config.floatTolerance}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => persistConfig({ floatTolerance: e.target.checked })}
              className="rounded border-white/5 bg-zinc-900 text-blue-600 focus:ring-0 focus:ring-offset-0"
            />
            Float Tolerance Epsilon
          </label>
          {config.floatTolerance && (
            <input
              type="number"
              step="0.000001"
              value={config.floatEpsilon}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfigLocal({ floatEpsilon: parseFloat(e.target.value) || 0.000001 })}
              onBlur={(e: React.FocusEvent<HTMLInputElement>) => persistConfig({ floatEpsilon: parseFloat(e.target.value) || 0.000001 })}
              className="bg-zinc-950/50 border border-white/5 rounded p-1 font-mono text-[11px] text-white focus:outline-none focus:border-blue-500/50 w-24 ml-auto"
            />
          )}
        </div>

        <div className="pt-2 border-t border-white/5 space-y-2">
          <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider pb-0.5">Workflow</div>
          <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
            <input
              type="checkbox"
              checked={config.autoRun}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => persistConfig({ autoRun: e.target.checked })}
              className="rounded border-white/5 bg-zinc-900 text-blue-600 focus:ring-0 focus:ring-offset-0"
            />
            <span>Auto-Run on Save</span>
            <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 font-mono border border-white/5">Ctrl+S</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
            <input
              type="checkbox"
              checked={config.autoSave}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => persistConfig({ autoSave: e.target.checked })}
              className="rounded border-white/5 bg-zinc-900 text-blue-600 focus:ring-0 focus:ring-offset-0"
            />
            Auto-Save Before Run
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
            <input
              type="checkbox"
              checked={config.autoClearConsole}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => persistConfig({ autoClearConsole: e.target.checked })}
              className="rounded border-white/5 bg-zinc-900 text-blue-600 focus:ring-0 focus:ring-offset-0"
            />
            Auto-Clear Outputs on Run
          </label>
        </div>

        <div className="pt-2 border-t border-white/5 space-y-2">
          <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider pb-0.5">Compiler & Runtime Commands</div>
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
            <div>
              <label className="block text-zinc-400 mb-0.5">C++ COMPILER</label>
              <input
                type="text"
                value={config.cppCommand}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfigLocal({ cppCommand: e.target.value })}
                onBlur={(e: React.FocusEvent<HTMLInputElement>) => persistConfig({ cppCommand: e.target.value })}
                placeholder="g++"
                className="w-full bg-zinc-950/50 border border-white/5 rounded p-1.5 font-mono text-[11px] text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-0.5">C COMPILER</label>
              <input
                type="text"
                value={config.cCommand}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfigLocal({ cCommand: e.target.value })}
                onBlur={(e: React.FocusEvent<HTMLInputElement>) => persistConfig({ cCommand: e.target.value })}
                placeholder="gcc"
                className="w-full bg-zinc-950/50 border border-white/5 rounded p-1.5 font-mono text-[11px] text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-0.5">JAVA RUNTIME</label>
              <input
                type="text"
                value={config.javaCommand}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfigLocal({ javaCommand: e.target.value })}
                onBlur={(e: React.FocusEvent<HTMLInputElement>) => persistConfig({ javaCommand: e.target.value })}
                placeholder="java"
                className="w-full bg-zinc-950/50 border border-white/5 rounded p-1.5 font-mono text-[11px] text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-0.5">PYTHON COMMAND</label>
              <input
                type="text"
                value={config.pythonCommand}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfigLocal({ pythonCommand: e.target.value })}
                onBlur={(e: React.FocusEvent<HTMLInputElement>) => persistConfig({ pythonCommand: e.target.value })}
                placeholder="python3"
                className="w-full bg-zinc-950/50 border border-white/5 rounded p-1.5 font-mono text-[11px] text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-white/5 space-y-2">
          <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider pb-0.5">Companion & Behavior</div>
          <div>
            <label className="block text-zinc-400 mb-1">DEFAULT LANGUAGE (Competitive Companion)</label>
            <div className="grid grid-cols-4 gap-1">
              {(['.cpp', '.c', '.java', '.py'] as const).map(ext => (
                <button
                  key={ext}
                  onClick={() => persistConfig({ defaultLanguageExtension: ext })}
                  className={`py-1 rounded text-[11px] font-mono font-semibold border transition-all ${
                    config.defaultLanguageExtension === ext
                      ? 'bg-blue-600/30 border-blue-500/50 text-blue-300'
                      : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:border-white/10 hover:text-zinc-300'
                  }`}
                >
                  {ext}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
            <input
              type="checkbox"
              checked={config.focusOnFileOpen}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => persistConfig({ focusOnFileOpen: e.target.checked })}
              className="rounded border-white/5 bg-zinc-900 text-blue-600 focus:ring-0 focus:ring-offset-0"
            />
            Focus Panel When File With Tests Is Opened
          </label>
        </div>

        <div className="pt-2 border-t border-white/5 space-y-2">
          <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider pb-0.5">UI Preferences</div>
          <div>
            <label className="block text-zinc-400 mb-1">EDITOR FONT SIZE: <span className="text-white font-bold">{config.fontSize || 12}px</span></label>
            <input
              type="range"
              min="8"
              max="24"
              step="1"
              value={config.fontSize || 12}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfigLocal({ fontSize: parseInt(e.target.value) })}
              onMouseUp={(e: React.MouseEvent<HTMLInputElement>) => persistConfig({ fontSize: parseInt(e.currentTarget.value) })}
              onTouchEnd={(e: React.TouchEvent<HTMLInputElement>) => persistConfig({ fontSize: parseInt(e.currentTarget.value) })}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
