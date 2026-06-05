import React, { useState, useEffect, useMemo } from 'react';
import { TestCase, RunnerConfig } from './types';
import { Header } from './components/Header';
import { ConfigPanel } from './components/ConfigPanel';
import { TestCaseList } from './components/TestCaseList';

// Define communication channel with VS Code API
declare const vscode: {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};

export default function App() {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [activeFile, setActiveFile] = useState<string>('No file open');
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [running, setRunning] = useState<boolean>(false);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [compileErrDismissed, setCompileErrDismissed] = useState<boolean>(false);

  // Engine configuration panel settings
  const [config, setConfig] = useState<RunnerConfig>({
    timeLimit: 2000,
    memoryLimit: 256,
    cppFlags: '-O2 -std=c++17 -Wshadow',
    cFlags: '-O2 -std=c11',
    javaFlags: '',
    ignoreTrailingWhitespace: true,
    ignoreSystemLineEndings: true,
    floatTolerance: false,
    floatEpsilon: 0.000001,
    maxWorkers: 4,
    autoRun: false,
    autoSave: true,
    autoClearConsole: true,
    cppCommand: 'g++',
    cCommand: 'gcc',
    javaCommand: 'java',
    pythonCommand: 'python3',
    defaultLanguageExtension: '.cpp',
    focusOnFileOpen: true,
    fontSize: 12,
  });

  // Update state locally for instant UI feedback (zero-lag slider drag)
  const setConfigLocal = (updatedFields: Partial<RunnerConfig>) => {
    setConfig(prev => ({ ...prev, ...updatedFields }));
  };

  // Persist state to VS Code backend when user finishes interacting (mouseUp or blur)
  const persistConfig = (updatedFields: Partial<RunnerConfig>) => {
    setConfig(prev => {
      const updated = { ...prev, ...updatedFields };
      vscode.postMessage({ type: 'updateConfig', config: updated });
      return updated;
    });
  };

  // Track global runner state
  useEffect(() => {
    // Listen to messages from VS Code extension backend
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'state':
          setTestCases(message.testCases);
          setActiveFile(message.fileName);
          if (message.config) {
            setConfig(message.config);
          }
          break;
        case 'activeFile':
          setActiveFile(message.fileName);
          break;
        case 'collapseAll':
          setRunning(true);
          setIsConfigOpen(false);
          setExpandedCards(prev => {
            const nextExpanded: Record<string, boolean> = {};
            Object.keys(prev).forEach(k => { nextExpanded[k] = false; });
            return nextExpanded;
          });
          break;
        case 'testProgress': {
          const MAX_UI_OUTPUT = 500 * 1024;
          setTestCases(prev => prev.map(t => {
            if (t.id === message.id) {
              return { ...t, actualOutput: ((t.actualOutput || '') + message.chunk).slice(-MAX_UI_OUTPUT) };
            }
            return t;
          }));
          break;
        }
        case 'testCaseUpdate':
          setTestCases(prev => prev.map(t => t.id === message.testCase.id ? message.testCase : t));
          break;
        case 'executionFinished':
          setRunning(false);
          setCompileErrDismissed(false); // Reset dismiss on each new run
          // Expand only failed/errored test cases after run completes
          setTestCases(prev => {
            const failedStatuses = new Set(['Failed', 'TLE', 'MLE', 'RTE', 'CompilationError']);
            const nextExpanded: Record<string, boolean> = {};
            prev.forEach(t => {
              nextExpanded[t.id] = failedStatuses.has(t.status);
            });
            setExpandedCards(nextExpanded);
            return prev;
          });
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    // Notify backend that the webview is ready and request initial state.
    // This ensures persisted test cases are loaded AFTER the message listener
    // is registered — fixes the blank panel on first open.
    vscode.postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const triggerRunAll = () => {
    setRunning(true);
    setIsConfigOpen(false); // Collapse config panel
    // Collapse all test cards while running
    setExpandedCards(prev => {
      const collapsed: Record<string, boolean> = {};
      Object.keys(prev).forEach(k => { collapsed[k] = false; });
      testCases.forEach(t => { collapsed[t.id] = false; });
      return collapsed;
    });
    vscode.postMessage({
      type: 'runAll',
      testCases,
      config
    });
  };

  const triggerStop = () => {
    vscode.postMessage({ type: 'stop' });
  };

  const addTestCase = () => {
    vscode.postMessage({ type: 'addTest' });
  };

  const deleteTestCase = (id: string) => {
    vscode.postMessage({ type: 'deleteTest', id });
  };

  const updateTestCase = (id: string, updatedFields: Partial<TestCase>) => {
    const updated = testCases.map(t => t.id === id ? { ...t, ...updatedFields } : t);
    setTestCases(updated);
    vscode.postMessage({ type: 'saveTests', testCases: updated });
  };

  const toggleCard = (id: string) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOpenKeybindings = () => {
    vscode.postMessage({ type: 'openKeybindings' });
  };

  // Status breakdown calculations
  const stats = useMemo(() => {
    const s = { passed: 0, failed: 0, tle: 0, mle: 0, rte: 0, compError: 0, total: testCases.length };
    for (const t of testCases) {
      if (t.status === 'Passed')          s.passed++;
      else if (t.status === 'Failed')     s.failed++;
      else if (t.status === 'TLE')        s.tle++;
      else if (t.status === 'MLE')        s.mle++;
      else if (t.status === 'RTE')        s.rte++;
      else if (t.status === 'CompilationError') s.compError++;
    }
    return s;
  }, [testCases]);

  // Find global compilation error (same message for all tests, show once)
  const compilationError = testCases.find(t => t.status === 'CompilationError' && t.errorMessage)?.errorMessage;

  return (
    <div className="flex flex-col space-y-2 w-full flex-1 min-h-0 text-vs-fg">
      <Header
        activeFile={activeFile}
        isConfigOpen={isConfigOpen}
        setIsConfigOpen={setIsConfigOpen}
        running={running}
        triggerStop={triggerStop}
        triggerRunAll={triggerRunAll}
        testCasesCount={testCases.length}
        stats={stats}
      />

      {isConfigOpen && (
        <ConfigPanel
          config={config}
          setConfigLocal={setConfigLocal}
          persistConfig={persistConfig}
          setIsConfigOpen={setIsConfigOpen}
          onOpenKeybindings={handleOpenKeybindings}
        />
      )}

      <TestCaseList
        testCases={testCases}
        expandedCards={expandedCards}
        config={config}
        addTestCase={addTestCase}
        updateTestCase={updateTestCase}
        deleteTestCase={deleteTestCase}
        toggleCard={toggleCard}
        compilationError={compilationError}
        compileErrDismissed={compileErrDismissed}
        setCompileErrDismissed={setCompileErrDismissed}
      />
    </div>
  );
}
