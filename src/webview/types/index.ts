export interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  actualOutput?: string;
  stderrOutput?: string;
  status: 'Idle' | 'Compiling' | 'Running' | 'Passed' | 'Failed' | 'TLE' | 'MLE' | 'RTE' | 'CompilationError';
  executionTime?: number;
  memoryUsage?: number;
  errorMessage?: string;
}

export interface RunnerConfig {
  timeLimit: number;
  memoryLimit: number;
  cppFlags: string;
  cFlags: string;
  javaFlags: string;
  ignoreTrailingWhitespace: boolean;
  ignoreSystemLineEndings: boolean;
  floatTolerance: boolean;
  floatEpsilon: number;
  maxWorkers: number;
  autoRun: boolean;
  autoSave: boolean;
  autoClearConsole: boolean;
  cppCommand: string;
  cCommand: string;
  javaCommand: string;
  pythonCommand: string;
  defaultLanguageExtension: string;
  focusOnFileOpen: boolean;
  fontSize: number;
}
