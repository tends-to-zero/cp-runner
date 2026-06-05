import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { CompetitiveCompanionListener } from './webhookListener';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  actualOutput?: string;
  stderrOutput?: string;
  status: 'Idle' | 'Compiling' | 'Running' | 'Passed' | 'Failed' | 'TLE' | 'MLE' | 'RTE' | 'CompilationError';
  executionTime?: number; // ms
  memoryUsage?: number;   // MB
  errorMessage?: string;
}

interface RunnerConfig {
  timeLimit: number;        // ms
  memoryLimit: number;      // MB
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

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  console.log('CP Runner is now active.');

  const provider = new CPRunnerViewProvider(context.extensionUri, context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'cp-runner-view',
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cp-runner.runTests',       () => {
      vscode.commands.executeCommand('cp-runner-view.focus');
      provider.runAllTests();
    }),
    vscode.commands.registerCommand('cp-runner.stopExecution',  () => provider.stopExecution()),
    vscode.commands.registerCommand('cp-runner.addTestCase',    () => provider.addTestCase()),
    vscode.commands.registerCommand('cp-runner.clearTestCases', () => provider.clearAllTestCases())
  );
}

export function deactivate() {
  // Extension cleanup — VS Code disposes subscriptions automatically.
  // This hook exists for explicit teardown if needed in the future.
}

// ─── Provider ─────────────────────────────────────────────────────────────────

class CPRunnerViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _testCases: TestCase[] = [];
  private _testCasesMap: Record<string, TestCase[]> = {};
  private _activeSourceFile: string = '';
  private _fileSupported: boolean = true;
  private _startupTimer?: NodeJS.Timeout;
  private _currentExecutionToken: { cancelled: boolean; runningProcesses: Set<child_process.ChildProcess> } = { cancelled: false, runningProcesses: new Set() };
  private _webhookListener: CompetitiveCompanionListener;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext
  ) {
    // Restore persisted test cases map
    const saved = this._context.workspaceState.get<string>('cp-testcases-map');
    if (saved) {
      try { this._testCasesMap = JSON.parse(saved); } catch { this._testCasesMap = {}; }
    }

    this._updateActiveSourceFile(true);
    // Deferred check: on cold start VS Code restores the active editor
    // asynchronously, so activeTextEditor may be null at construction time.
    // A short delay lets the editor state settle before we attempt focus.
    this._startupTimer = setTimeout(() => this._updateActiveSourceFile(true), 500);

    this._context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => this._updateActiveSourceFile()),

      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('cp-runner')) {
          this._sendStateToWebview();
        }
      }),

      vscode.workspace.onDidSaveTextDocument((doc) => {
        const cfg = vscode.workspace.getConfiguration('cp-runner');
        if (
          cfg.get<boolean>('execution.autoRun', false) &&
          doc.uri.fsPath === this._activeSourceFile &&
          this._testCases.length > 0
        ) {
          this.runAllTests();
        }
      })
    );

    // Initialize webhook listener
    this._webhookListener = new CompetitiveCompanionListener();
    this._webhookListener.on('error', (err) => {
      console.error('CP Runner Webhook Error:', err);
    });
    
    this._webhookListener.on('problem', async (payload) => {
      // 1. Determine the filename and path
      const config = vscode.workspace.getConfiguration('cp-runner');
      const defaultExt = config.get<string>('defaultLanguageExtension', '.cpp');
      
      // Sanitize the problem name to make it a valid filename
      const sanitizedName = payload.name.replace(/[<>:"/\\|?*\x00]+/g, '_').trim();
      
      // Determine directory
      let targetDir = '';
      if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        targetDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
      } else if (vscode.window.activeTextEditor) {
        targetDir = path.dirname(vscode.window.activeTextEditor.document.uri.fsPath);
      } else {
        vscode.window.showErrorMessage('CP Runner: Open a workspace or a file first to save the problem.');
        return;
      }
      
      let targetFilePath = '';
      let fileName = '';

      try {
        const files = await fs.readdir(targetDir);
        const matches = files.filter(f => f.startsWith(sanitizedName + '.') || f === sanitizedName);
        
        if (matches.length === 1) {
          fileName = matches[0];
          targetFilePath = path.join(targetDir, fileName);
        } else if (matches.length > 1) {
          const picked = await vscode.window.showQuickPick(matches, { placeHolder: 'Multiple matching files found. Select which one to use:' });
          if (!picked) return; // User cancelled
          fileName = picked;
          targetFilePath = path.join(targetDir, fileName);
        } else {
          // No match, prompt to pick an extension
          const exts = ['.cpp', '.c', '.java', '.py'].filter((e, i, a) => a.indexOf(e) === i || e === defaultExt);
          const pickedExt = await vscode.window.showQuickPick(exts, { placeHolder: `Select file extension to create ${sanitizedName}` });
          if (!pickedExt) return; // User cancelled
          
          fileName = `${sanitizedName}${pickedExt.startsWith('.') ? pickedExt : '.' + pickedExt}`;
          targetFilePath = path.join(targetDir, fileName);
          await fs.writeFile(targetFilePath, '', 'utf8');
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`CP Runner: Error accessing directory. ${err.message}`);
        return;
      }
      
      // 3. Open the file in editor
      const document = await vscode.workspace.openTextDocument(targetFilePath);
      await vscode.window.showTextDocument(document);
      
      // Focus the extension panel so the user sees test cases immediately
      vscode.commands.executeCommand('cp-runner-view.focus');
      
      // 4. Update testcases (force synchronous state update)
      this._activeSourceFile = targetFilePath;
      this._testCases = payload.tests.map(tc => ({
        id: crypto.randomUUID(),
        input: tc.input,
        expectedOutput: tc.output,
        status: 'Idle'
      }));
      this._persistTestCases();
      this._sendStateToWebview();
      vscode.window.showInformationMessage(`CP Runner: Parsed testcases for "${payload.name}" and opened ${fileName}`);
    });

    this._webhookListener.start().catch((err) => {
      vscode.window.showWarningMessage(`CP Runner: Could not start Competitive Companion listener on port ${this._webhookListener.config.port}. ${err.message}`);
    });

    this._context.subscriptions.push({
      dispose: () => {
        if (this._startupTimer) clearTimeout(this._startupTimer);
        this._webhookListener.stop();
      }
    });
  }

  // ─── resolveWebviewView ──────────────────────────────────────────────────────

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    this._sendStateToWebview();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          this._sendStateToWebview();
          break;
        case 'runAll':
          this._testCases = message.testCases;
          this.runAllTests(message.config);
          break;
        case 'stop':
          this.stopExecution();
          break;
        case 'saveTests':
          this._testCases = message.testCases;
          this._persistTestCases();
          break;
        case 'addTest':
          this.addTestCase();
          break;
        case 'deleteTest':
          this._testCases = this._testCases.filter(t => t.id !== message.id);
          this._persistTestCases();
          this._sendStateToWebview();
          break;
        case 'updateConfig':
          if (message.config) {
            await this._updateWorkspaceConfig(message.config);
          }
          break;
        case 'openKeybindings':
          vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'cp-runner.runTests');
          break;
      }
    });

    this._updateActiveSourceFile();
  }

  // ─── Public commands ─────────────────────────────────────────────────────────

  public addTestCase() {
    const newTest: TestCase = {
      id: crypto.randomUUID(),
      input: '',
      expectedOutput: '',
      status: 'Idle'
    };
    this._testCases.push(newTest);
    this._persistTestCases();
    this._sendStateToWebview();
  }

  public clearAllTestCases() {
    this._testCases = [];
    this._persistTestCases();
    this._sendStateToWebview();
  }

  public async stopExecution() {
    this._currentExecutionToken.cancelled = true;
    const procs = Array.from(this._currentExecutionToken.runningProcesses);
    const killPromises = procs.map(proc => {
      return new Promise<void>((resolve) => {
        if (proc.killed || proc.exitCode !== null) {
          resolve();
          return;
        }
        proc.on('close', resolve);
        proc.on('error', resolve);
        try { proc.kill('SIGKILL'); } catch { resolve(); }
      });
    });
    
    await Promise.all(killPromises);
    this._currentExecutionToken.runningProcesses.clear();

    this._testCases = this._testCases.map(t =>
      (t.status === 'Running' || t.status === 'Compiling')
        ? { ...t, status: 'Idle' as const }
        : t
    );
    this._sendStateToWebview();
    this._view?.webview.postMessage({ type: 'executionFinished' });
    vscode.window.showInformationMessage('CP Runner: Execution stopped.');
  }

  // ─── Run all tests ───────────────────────────────────────────────────────────

  public async runAllTests(customConfig?: RunnerConfig) {
    if (!this._activeSourceFile) {
      vscode.window.showErrorMessage('CP Runner: No active C++/Java/Python file to run tests against.');
      return;
    }

    // Stop any previous run cleanly
    if (this._currentExecutionToken.runningProcesses.size > 0) {
      await this.stopExecution();
    }

    const config = customConfig || this._getWorkspaceConfig();

    // Auto-save before compile
    if (config.autoSave) {
      const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === this._activeSourceFile);
      if (doc?.isDirty) {
        await doc.save();
      }
    }

    // Issue a fresh cancellation token
    this._currentExecutionToken.cancelled = true;
    const token = { cancelled: false, runningProcesses: new Set<child_process.ChildProcess>() };
    this._currentExecutionToken = token;

    const fileExt = path.extname(this._activeSourceFile);
    const needsCompile = ['.cpp', '.c', '.java'].includes(fileExt);
    let binaryPath = this._activeSourceFile;

    // Collapse UI, signal compile start
    this._view?.webview.postMessage({ type: 'collapseAll' });

    if (needsCompile) {
      if (config.autoClearConsole) {
        this._testCases = this._testCases.map(t => ({ ...t, actualOutput: '', errorMessage: undefined }));
      }
      this._testCases = this._testCases.map(t => ({ ...t, status: 'Compiling' as const }));
      this._sendStateToWebview();

      try {
        binaryPath = await this._compileSourceFile(this._activeSourceFile, fileExt, config, token);
      } catch (err: any) {
        if (token.cancelled) { return; }
        this._testCases = this._testCases.map(t => ({
          ...t, status: 'CompilationError' as const,
          errorMessage: err.message || 'Compilation failed.'
        }));
        this._sendStateToWebview();
        this._view?.webview.postMessage({ type: 'executionFinished' });
        vscode.window.showErrorMessage('CP Runner: Compilation failed.');
        return;
      }
    }

    if (token.cancelled) { return; }

    // Clear outputs and reset statuses
    this._testCases = this._testCases.map(t => ({
      ...t,
      status: 'Idle' as const,
      executionTime: 0,
      memoryUsage: 0,
      errorMessage: undefined,
      ...(config.autoClearConsole ? { actualOutput: '' } : {})
    }));
    this._sendStateToWebview();

    // Concurrency-controlled worker pool
    const queue = [...this._testCases];
    const runWorker = async () => {
      while (!token.cancelled) {
        const testCase = queue.shift();
        if (!testCase) { break; }
        await this._runSingleTestCase(testCase, binaryPath, fileExt, config, token);
      }
    };

    const maxOsWorkers = os.cpus().length;
    if (config.maxWorkers > maxOsWorkers) {
      vscode.window.showWarningMessage(`CP Runner: maxWorkers (${config.maxWorkers}) exceeds available CPU cores (${maxOsWorkers}). This may reduce performance.`);
    }
    const workerCount = Math.min(config.maxWorkers, queue.length);
    await Promise.all(Array.from({ length: workerCount }, runWorker));

    if (!token.cancelled) {
      this._view?.webview.postMessage({ type: 'executionFinished' });
    }
  }

  // ─── Compile ─────────────────────────────────────────────────────────────────

  private async _compileSourceFile(
    filePath: string,
    ext: string,
    config: RunnerConfig,
    token: { cancelled: boolean; runningProcesses: Set<child_process.ChildProcess> }
  ): Promise<string> {
    const parentDir = path.dirname(filePath);
    const fileNameWithoutExt = path.basename(filePath, ext);
    const binDir = path.join(parentDir, '.cph-bin');

    if (!fsSync.existsSync(binDir)) {
      await fs.mkdir(binDir, { recursive: true });
    }

    let outputBinary: string;
    let compileCmd: string;
    let args: string[];

    if (ext === '.java') {
      outputBinary = path.join(binDir, `${fileNameWithoutExt}.class`);
      compileCmd = 'javac';
      const flagArgs = config.javaFlags.trim() ? config.javaFlags.trim().split(/\s+/) : [];
      args = [...flagArgs, '-d', binDir, filePath];
    } else if (ext === '.c') {
      const exeName = os.platform() === 'win32' ? `${fileNameWithoutExt}.exe` : fileNameWithoutExt;
      outputBinary = path.join(binDir, exeName);
      compileCmd = config.cCommand || 'gcc';
      const flagArgs = config.cFlags.trim() ? config.cFlags.trim().split(/\s+/) : [];
      args = [...flagArgs, filePath, '-o', outputBinary];
    } else {
      // .cpp
      const exeName = os.platform() === 'win32' ? `${fileNameWithoutExt}.exe` : fileNameWithoutExt;
      outputBinary = path.join(binDir, exeName);
      compileCmd = config.cppCommand || 'g++';
      const flagArgs = config.cppFlags.trim() ? config.cppFlags.trim().split(/\s+/) : [];
      args = [...flagArgs, filePath, '-o', outputBinary];
    }

    // Incremental: skip recompile if binary is newer than source
    try {
      const [srcStat, binStat] = await Promise.all([fs.stat(filePath), fs.stat(outputBinary)]);
      if (srcStat.mtimeMs < binStat.mtimeMs) {
        console.log('CP Runner: Using cached binary at', outputBinary);
        return outputBinary;
      }
    } catch { /* Binary doesn't exist yet — compile */ }

    if (token.cancelled) { throw new Error('Compilation cancelled.'); }

    return new Promise((resolve, reject) => {
      const compiler = child_process.spawn(compileCmd, args, { cwd: parentDir });
      token.runningProcesses.add(compiler);

      let stderr = '';
      compiler.stderr.on('data', d => { stderr += d.toString(); });

      compiler.on('close', (code) => {
        token.runningProcesses.delete(compiler);
        if (token.cancelled) { reject(new Error('Compilation cancelled.')); return; }
        code === 0 ? resolve(outputBinary) : reject(new Error(stderr || `Compiler exited with code ${code}`));
      });

      compiler.on('error', (err) => {
        token.runningProcesses.delete(compiler);
        if (token.cancelled) { reject(new Error('Compilation cancelled.')); return; }
        reject(new Error(`Compiler not found or crashed: ${err.message}`));
      });
    });
  }

  // ─── Run single test ─────────────────────────────────────────────────────────

  private async _runSingleTestCase(
    testCase: TestCase,
    binaryPath: string,
    ext: string,
    config: RunnerConfig,
    token: { cancelled: boolean; runningProcesses: Set<child_process.ChildProcess> }
  ): Promise<void> {
    if (token.cancelled) { return; }

    testCase.status = 'Running';
    this._updateTestCaseInList(testCase);
    this._view?.webview.postMessage({ type: 'testCaseUpdate', testCase });

    const parentDir = path.dirname(this._activeSourceFile);
    let runCmd: string;
    let args: string[];

    if (ext === '.py') {
      runCmd = config.pythonCommand || (os.platform() === 'win32' ? 'python' : 'python3');
      args = [binaryPath];
    } else if (ext === '.java') {
      runCmd = config.javaCommand || 'java';
      const binDir = path.join(parentDir, '.cph-bin');
      args = ['-cp', binDir, path.basename(binaryPath, '.class')];
    } else {
      // .c or .cpp — run the compiled binary directly
      runCmd = binaryPath;
      args = [];
    }

    return new Promise((resolve) => {
      const startTime = process.hrtime.bigint();
      const child = child_process.spawn(runCmd, args, { cwd: parentDir });
      token.runningProcesses.add(child);

      let stdoutData = '';
      let stderrData = '';
      let isTLE = false;
      let isMLE = false;
      let isOLE = false;
      let peakMemoryMB = 0;
      const MAX_OUTPUT_LENGTH = 1024 * 1024; // 1MB limit for outputs

      // Feed stdin
      try {
        if (testCase.input) { child.stdin.write(testCase.input); }
        child.stdin.end();
      } catch { }
      child.stdin.on('error', () => { });

      // Stream stdout to UI for live output
      child.stdout.on('data', (data) => {
        if (token.cancelled || isOLE) { return; }
        const chunk = data.toString();
        
        if (stdoutData.length + chunk.length > MAX_OUTPUT_LENGTH) {
          isOLE = true;
          const remainingAllowed = Math.max(0, MAX_OUTPUT_LENGTH - stdoutData.length);
          const safeChunk = chunk.substring(0, remainingAllowed) + '\n\n...[Output Limit Exceeded]';
          stdoutData += safeChunk;
          this._view?.webview.postMessage({ type: 'testProgress', id: testCase.id, chunk: safeChunk });
          clearInterval(memPoller);
          try { child.kill('SIGKILL'); } catch { }
          return;
        }

        stdoutData += chunk;
        this._view?.webview.postMessage({ type: 'testProgress', id: testCase.id, chunk });
      });

      child.stderr.on('data', (data) => {
        if (token.cancelled || isOLE) { return; }
        const chunk = data.toString();
        if (stderrData.length + chunk.length > MAX_OUTPUT_LENGTH) {
           stderrData += chunk.substring(0, Math.max(0, MAX_OUTPUT_LENGTH - stderrData.length)) + '\n...[Stderr Limit Exceeded]';
        } else {
           stderrData += chunk;
        }
      });

      // TLE enforcement
      const tlTimer = setTimeout(() => {
        isTLE = true;
        clearInterval(memPoller);
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
      }, config.timeLimit);

      // MLE polling — every 50ms
      let isPolling = false;
      const memPoller = setInterval(async () => {
        if (isPolling) return;
        if (child.killed || token.cancelled) { return; }
        isPolling = true;
        const pid = child.pid;
        if (!pid) { isPolling = false; return; }

        try {
          let currentMB = 0;
          let hwmMB = 0;

          if (os.platform() === 'linux') {
            // Read /proc/<pid>/status — most accurate on Linux
            const statusPath = `/proc/${pid}/status`;
            try {
              const status = await fs.readFile(statusPath, 'utf8');
              const hwm  = status.match(/VmHWM:\s+(\d+)\s+kB/);  // High Water Mark (peak RSS)
              const rss  = status.match(/VmRSS:\s+(\d+)\s+kB/);  // Current RSS
              if (hwm)  { hwmMB     = parseInt(hwm[1], 10)  / 1024; }
              if (rss)  { currentMB = parseInt(rss[1], 10)  / 1024; }
            } catch { }
          } else if (os.platform() === 'darwin') {
            // macOS: use ps to read RSS
            try {
              const util = require('util');
              const execFileAsync = util.promisify(child_process.execFile);
              const { stdout } = await execFileAsync('ps', ['-o', 'rss=', '-p', pid.toString()], { timeout: 50 });
              currentMB = parseInt(stdout.trim(), 10) / 1024;
            } catch { /* process may have already exited */ }
          } else {
            // Windows / other: no reliable low-overhead mechanism;
            // skip MLE tracking (users can set memoryLimit to 0 to disable).
            clearInterval(memPoller);
            isPolling = false;
            return;
          }

          const observedPeak = Math.max(hwmMB, currentMB);
          if (observedPeak > peakMemoryMB) { peakMemoryMB = observedPeak; }

          if (peakMemoryMB > config.memoryLimit) {
            isMLE = true;
            clearInterval(memPoller);
            try { child.kill('SIGKILL'); } catch { /* already gone */ }
          }
        } catch { /* process exited mid-read — safe to ignore */ } finally {
          isPolling = false;
        }
      }, 50);

      child.on('close', (code, signal) => {
        clearTimeout(tlTimer);
        clearInterval(memPoller);
        token.runningProcesses.delete(child);

        if (token.cancelled) { resolve(); return; }

        const elapsedMs = Number(process.hrtime.bigint() - startTime) / 1e6;
        testCase.executionTime = parseFloat(elapsedMs.toFixed(1));
        testCase.memoryUsage   = parseFloat(peakMemoryMB.toFixed(2));
        testCase.actualOutput  = stdoutData;
        testCase.stderrOutput  = stderrData || undefined;

        if (isOLE) {
          testCase.status       = 'RTE';
          testCase.errorMessage = `Output Limit Exceeded (> 1MB)`;
        } else if (isTLE) {
          testCase.status       = 'TLE';
          testCase.errorMessage = `Time Limit Exceeded (> ${config.timeLimit}ms)`;
        } else if (isMLE) {
          testCase.status       = 'MLE';
          testCase.errorMessage = `Memory Limit Exceeded (> ${config.memoryLimit}MB)`;
        } else if (signal !== null && signal !== undefined) {
          testCase.status       = 'RTE';
          testCase.errorMessage = stderrData || `Runtime Error (killed by signal ${signal})`;
        } else if (code !== 0 && code !== null) {
          testCase.status       = 'RTE';
          testCase.errorMessage = stderrData || `Runtime Error (exit code ${code})`;
        } else {
          const match = this._compareOutputs(stdoutData, testCase.expectedOutput, config);
          testCase.status = match ? 'Passed' : 'Failed';
        }

        this._updateTestCaseInList(testCase);
        this._persistTestCases();
        this._view?.webview.postMessage({ type: 'testCaseUpdate', testCase });
        resolve();
      });

      child.on('error', (err) => {
        clearTimeout(tlTimer);
        clearInterval(memPoller);
        token.runningProcesses.delete(child);

        if (token.cancelled) { resolve(); return; }

        testCase.status       = 'RTE';
        testCase.errorMessage = err.message || 'Failed to launch child process.';
        this._updateTestCaseInList(testCase);
        this._persistTestCases();
        this._view?.webview.postMessage({ type: 'testCaseUpdate', testCase });
        resolve();
      });
    });
  }

  // ─── Output comparison ───────────────────────────────────────────────────────

  private _compareOutputs(actual: string, expected: string, config: RunnerConfig): boolean {
    let act = actual;
    let exp = expected;

    if (config.ignoreSystemLineEndings) {
      act = act.replace(/\r\n/g, '\n');
      exp = exp.replace(/\r\n/g, '\n');
    }

    if (config.ignoreTrailingWhitespace) {
      act = act.replace(/[ \t]+$/gm, '').trim();
      exp = exp.replace(/[ \t]+$/gm, '').trim();
    } else {
      act = act.trim();
      exp = exp.trim();
    }

    if (config.floatTolerance) {
      const actTokens = act.split(/\s+/);
      const expTokens = exp.split(/\s+/);
      if (actTokens.length !== expTokens.length) { return false; }
      for (let i = 0; i < actTokens.length; i++) {
        const a = parseFloat(actTokens[i]);
        const e = parseFloat(expTokens[i]);
        if (!isNaN(a) && !isNaN(e)) {
          if (Math.abs(a - e) > config.floatEpsilon) { return false; }
        } else if (actTokens[i] !== expTokens[i]) { return false; }
      }
      return true;
    }

    return act === exp;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private _updateActiveSourceFile(forceReload: boolean = false) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    const filePath = editor.document.uri.fsPath;
    const ext = path.extname(filePath);
    const supported = ['.cpp', '.c', '.java', '.py'].includes(ext);

    if (!supported) {
      this._fileSupported = false;
      // Notify webview that this file type isn't supported
      this._view?.webview.postMessage({
        type: 'activeFile',
        fileName: path.basename(filePath),
        filePath,
        supported: false
      });
      return;
    }

    this._fileSupported = true;

    if (this._activeSourceFile !== filePath || forceReload) {
      this._activeSourceFile = filePath;
      this._loadTestCasesForActiveFile();
      this._sendStateToWebview();

      // Auto-focus the panel if this file already has test cases assigned
      const cfg = this._getWorkspaceConfig();
      if (this._testCases.length > 0 && cfg.focusOnFileOpen) {
        vscode.commands.executeCommand('cp-runner-view.focus');
      }
    }
    this._view?.webview.postMessage({
      type: 'activeFile',
      fileName: path.basename(filePath),
      filePath,
      supported: true
    });
  }

  private _loadTestCasesForActiveFile() {
    if (this._activeSourceFile && this._testCasesMap[this._activeSourceFile]) {
      this._testCases = this._testCasesMap[this._activeSourceFile];
    } else {
      this._testCases = [];
    }
  }

  private _updateTestCaseInList(testCase: TestCase) {
    this._testCases = this._testCases.map(t => t.id === testCase.id ? { ...testCase } : t);
  }

  private _persistTimer: NodeJS.Timeout | null = null;
  private _persistTestCases() {
    if (!this._activeSourceFile) { return; }
    
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
    }
    
    this._persistTimer = setTimeout(() => {
      const stripped = this._testCases.map(({ id, input, expectedOutput, status }) => ({
        id, input, expectedOutput, status: 'Idle' as const
      }));
      this._testCasesMap[this._activeSourceFile] = stripped;
      
      const fileKeys = Object.keys(this._testCasesMap);
      if (fileKeys.length > 50) {
        delete this._testCasesMap[fileKeys[0]];
      }
      
      this._context.workspaceState.update('cp-testcases-map', JSON.stringify(this._testCasesMap));
    }, 500);
  }

  private _sendStateToWebview() {
    this._view?.webview.postMessage({
      type: 'state',
      testCases: this._testCases,
      fileName: this._activeSourceFile ? path.basename(this._activeSourceFile) : 'No file open',
      fileSupported: this._fileSupported,
      config: this._getWorkspaceConfig()
    });
  }

  private _getWorkspaceConfig(): RunnerConfig {
    const c = vscode.workspace.getConfiguration('cp-runner');
    return {
      timeLimit:                c.get<number>('execution.timeLimit',                2000),
      memoryLimit:              c.get<number>('execution.memoryLimit',              256),
      cppFlags:                 c.get<string>('compiler.cppFlags',                 '-O2 -std=c++17 -Wshadow'),
      cFlags:                   c.get<string>('compiler.cFlags',                   '-O2 -std=c11'),
      javaFlags:                c.get<string>('compiler.javaFlags',                ''),
      ignoreTrailingWhitespace: c.get<boolean>('diff.ignoreTrailingWhitespace',    true),
      ignoreSystemLineEndings:  c.get<boolean>('diff.ignoreSystemLineEndings',     true),
      floatTolerance:           c.get<boolean>('diff.floatTolerance',              false),
      floatEpsilon:             c.get<number>('diff.floatEpsilon',                 0.000001),
      maxWorkers:               c.get<number>('concurrency.maxWorkers',            4),
      autoRun:                  c.get<boolean>('execution.autoRun',                false),
      autoSave:                 c.get<boolean>('execution.autoSave',               true),
      autoClearConsole:         c.get<boolean>('execution.autoClearConsole',       true),
      cppCommand:               c.get<string>('compiler.cppCommand',               'g++'),
      cCommand:                 c.get<string>('compiler.cCommand',                 'gcc'),
      javaCommand:              c.get<string>('compiler.javaCommand',              'java'),
      pythonCommand:            c.get<string>('compiler.pythonCommand',            'python3'),
      defaultLanguageExtension: c.get<string>('defaultLanguageExtension',          '.cpp'),
      focusOnFileOpen:          c.get<boolean>('execution.focusOnFileOpen',        true),
      fontSize:                 c.get<number>('ui.fontSize',                       12),
    };
  }

  private async _updateWorkspaceConfig(config: RunnerConfig) {
    const ws = vscode.workspace.getConfiguration('cp-runner');
    const target = vscode.workspace.workspaceFolders
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    try {
      await Promise.all([
        ws.update('execution.timeLimit',              config.timeLimit,                target),
        ws.update('execution.memoryLimit',            config.memoryLimit,              target),
        ws.update('compiler.cppFlags',                config.cppFlags,                 target),
        ws.update('compiler.cFlags',                  config.cFlags,                   target),
        ws.update('compiler.javaFlags',               config.javaFlags,                target),
        ws.update('diff.ignoreTrailingWhitespace',    config.ignoreTrailingWhitespace, target),
        ws.update('diff.ignoreSystemLineEndings',     config.ignoreSystemLineEndings,  target),
        ws.update('diff.floatTolerance',              config.floatTolerance,           target),
        ws.update('diff.floatEpsilon',                config.floatEpsilon,             target),
        ws.update('concurrency.maxWorkers',           config.maxWorkers,               target),
        ws.update('execution.autoRun',                config.autoRun,                  target),
        ws.update('execution.autoSave',               config.autoSave,                 target),
        ws.update('execution.autoClearConsole',       config.autoClearConsole,         target),
        ws.update('compiler.cppCommand',              config.cppCommand,               target),
        ws.update('compiler.cCommand',                config.cCommand,                 target),
        ws.update('compiler.javaCommand',             config.javaCommand,              target),
        ws.update('compiler.pythonCommand',           config.pythonCommand,            target),
        ws.update('defaultLanguageExtension',         config.defaultLanguageExtension, target),
        ws.update('execution.focusOnFileOpen',        config.focusOnFileOpen,          target),
        ws.update('ui.fontSize',                      config.fontSize,                 target),
      ]);
    } catch (err) {
      console.error('CP Runner: Error saving config:', err);
    }
  }

  // ─── HTML Template ────────────────────────────────────────────────────────────

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('hex');

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'index.js')
    );
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'styles.css')
    );

    // CSP: allow styles from webview origin + VS Code nonce scripts only
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource} data:`,
      `img-src ${webview.cspSource} data:`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CP Runner</title>
  <link rel="stylesheet" href="${stylesUri}">
</head>
<body class="pt-0 px-2 pb-2 text-[13px] select-none flex flex-col">
  <div id="root" class="flex flex-col flex-1 min-h-0"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    window.vscode = vscode;
  </script>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
