# CP Runner — Full Code Review

> **Scope**: `src/extension.ts`, `src/webhookListener.ts`, `src/webview/App.tsx`, all components and types.

---

## 🐛 Bugs

### 1. `_sendStateToWebview` always sets `fileSupported: true`
**File**: [extension.ts](file:///home/adistro/Documents/cp/src/extension.ts#L744-L752)

```ts
private _sendStateToWebview() {
  this._view?.webview.postMessage({
    type: 'state',
    ...
    fileSupported: true,   // ← always hardcoded to true!
  });
}
```
`_updateActiveSourceFile` already posts a separate `activeFile` message with the correct `supported` flag, but `_sendStateToWebview` never mirrors it. If the panel loads with an unsupported file type, the webview state still reports `fileSupported: true`, which can be misleading.

**Fix**: Store `_fileSupported: boolean` as a field alongside `_activeSourceFile` and use it in `_sendStateToWebview`.

---

### 2. `triggerStop` sets `running = false` optimistically before confirmation
**File**: [App.tsx](file:///home/adistro/Documents/cp/src/webview/App.tsx#L140-L143)

```ts
const triggerStop = () => {
  vscode.postMessage({ type: 'stop' });
  setRunning(false);  // ← immediate, but backend may still be killing procs
};
```
If the backend takes time killing processes, the UI shows "idle" while children are still dying. If a test case finishes *after* the stop message but before the kill completes, a spurious `executionFinished` event then re-sets `running = false` on a UI that already thinks it's stopped — harmless, but can cause a double-state reset race.

**Fix**: Let the backend send an `executionStopped` or `executionFinished` acknowledgement and only then set `running = false` in the UI.

---

### 3. `isExpanded` default is inverted — new cards start expanded
**File**: [TestCaseList.tsx](file:///home/adistro/Documents/cp/src/webview/components/TestCaseList.tsx#L62)

```tsx
isExpanded={expandedCards[test.id] !== false}
```
A card that has never been in `expandedCards` (undefined key) will evaluate to `undefined !== false` → `true`, so **all newly added test cards start expanded**. This is probably unintentional for cards added mid-run.

**Fix**: Use `expandedCards[test.id] === true` or initialise the key to `false` when `addTestCase` is called.

---

### 4. `autoSave` only saves the *active* editor, not the source file
**File**: [extension.ts](file:///home/adistro/Documents/cp/src/extension.ts#L321-L326)

```ts
if (config.autoSave) {
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.isDirty) {
    await editor.document.save();
  }
}
```
If the user switches to a different file (e.g. notes) and then triggers a run via the keybinding, the wrong document gets saved (or not saved at all). The save should target `this._activeSourceFile`, not whatever happens to be focused at that moment.

**Fix**:
```ts
const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === this._activeSourceFile);
if (doc?.isDirty) { await doc.save(); }
```

---

### 5. `stdin.write` is not error-guarded
**File**: [extension.ts](file:///home/adistro/Documents/cp/src/extension.ts#L512)

```ts
if (testCase.input) { child.stdin.write(testCase.input); }
child.stdin.end();
```
If the child process crashes before consuming stdin (RTE on first byte), the `stdin.write` / `stdin.end` call will throw `EPIPE`. This will bubble as an unhandled promise rejection in some Node versions.

**Fix**: Wrap in a try/catch or pass `{ end: false }` to spawn and use the `'error'` event on `stdin`.

---

### 6. `_persistTestCases` serializes *all* files every save
**File**: [extension.ts](file:///home/adistro/Documents/cp/src/extension.ts#L737-L742)

```ts
private _persistTestCases() {
  if (this._activeSourceFile) {
    this._testCasesMap[this._activeSourceFile] = this._testCases;
    this._context.workspaceState.update('cp-testcases-map', JSON.stringify(this._testCasesMap));
  }
}
```
`JSON.stringify` of the entire map is called on every test case update during a run (once per finished test). For 10 test cases with large outputs, this can be tens of KB of JSON stringified 10 times per second. VS Code `workspaceState` is synchronous-write backed by sqlite and this pattern can create measurable write pressure.

**Fix**: Debounce persist calls or skip persisting during active runs (only persist on `executionFinished`).

---

### 7. `testProgress` messages bypass the 1 MB OLE guard in the React state
**File**: [App.tsx](file:///home/adistro/Documents/cp/src/webview/App.tsx#L88-L95)

```ts
case 'testProgress':
  setTestCases(prev => prev.map(t => {
    if (t.id === message.id) {
      return { ...t, actualOutput: (t.actualOutput || '') + message.chunk };
    }
    return t;
  }));
```
The 1 MB `MAX_OUTPUT_LENGTH` is enforced on the *extension* side, but chunks can still arrive before the kill signal propagates. The React state for `actualOutput` has **no cap**. A fast process that produces output right as the OLE kill is sent can fill React state with more than 1 MB before the `close` event fires and terminates the stream.

**Fix**: Mirror the output cap in the React reducer:
```ts
const MAX_UI_OUTPUT = 500 * 1024; // 500 KB in UI
return { ...t, actualOutput: ((t.actualOutput || '') + message.chunk).slice(-MAX_UI_OUTPUT) };
```

---

## ⚡ Performance

### 8. O(n) `_updateTestCaseInList` called before every `_sendStateToWebview`
**File**: [extension.ts](file:///home/adistro/Documents/cp/src/extension.ts#L733-L735)

```ts
private _updateTestCaseInList(testCase: TestCase) {
  this._testCases = this._testCases.map(t => t.id === testCase.id ? { ...testCase } : t);
}
```
Called every time a single test finishes, then followed immediately by `_sendStateToWebview` which serializes **all** test cases into a JSON postMessage. For 100 test cases with large outputs, the JSON serialization overhead is significant. Consider batching state updates or sending only the delta (`testCaseUpdate` event with a single test case) instead of the full array.

---

### 9. `stats` computed inline on every render with 5 separate `.filter` passes
**File**: [App.tsx](file:///home/adistro/Documents/cp/src/webview/App.tsx#L168-L176)

```ts
const stats = {
  passed:     testCases.filter(t => t.status === 'Passed').length,
  failed:     testCases.filter(t => t.status === 'Failed').length,
  tle:        testCases.filter(t => t.status === 'TLE').length,
  ...
};
```
5× O(n) scans per render, triggered by *every* `testProgress` event. Use a single-pass accumulator and wrap in `useMemo`:

```ts
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
```

---

### 10. MLE poller uses `fsSync.existsSync` in a hot 20ms loop
**File**: [extension.ts](file:///home/adistro/Documents/cp/src/extension.ts#L551-L591)

`fsSync.existsSync` is a synchronous syscall inside an `setInterval(20ms)` loop. `readFileSync` on `/proc/<pid>/status` is also synchronous. While each call is fast on Linux, running this for 4 workers simultaneously means up to **200 sync I/O calls per second** on the extension host thread. Consider using `fs.promises.readFile` or increasing the interval to 50ms.

---

### 11. `child_process.execSync` inside a hot MLE interval (macOS path)
**File**: [extension.ts](file:///home/adistro/Documents/cp/src/extension.ts#L573)

```ts
const psOut = child_process.execSync(`ps -o rss= -p ${pid}`, { timeout: 50 }).toString().trim();
```
`execSync` blocks the event loop. On macOS this is called every 20ms per worker. Use `spawnSync` with parsed args instead (avoids shell injection too — see Security section), or switch to async `exec`.

---

### 12. Memory leak: `_runningProcesses` tracks compiler AND runtime processes
**File**: [extension.ts](file:///home/adistro/Documents/cp/src/extension.ts#L447)

The compiler process is added to `_runningProcesses` and removed on `close`. However, if `stopExecution` is called during compilation, `this._runningProcesses.clear()` is called, then `runAllTests` does `this._runningProcesses.clear()` again before spawning new processes. This is safe, but a second `stopExecution` call before the new run starts could prematurely clear processes that were just about to be added.

**Fix**: Use a per-run `Set` rather than a shared class-level set. Pass it as a closure to `runAllTests`.

---

## 🔒 Safety / Security

### 13. Shell injection risk via `config.cppCommand` / `pythonCommand` (macOS MLE path)
**File**: [extension.ts](file:///home/adistro/Documents/cp/src/extension.ts#L573)

```ts
child_process.execSync(`ps -o rss= -p ${pid}`, { timeout: 50 })
```
`pid` is a number so it can't be injected here, but it demonstrates the pattern. More critically, `config.cppCommand` and `config.pythonCommand` are user-supplied strings that feed directly into `child_process.spawn`. While `spawn` doesn't use a shell by default (so shell metacharacters don't execute), a user can supply a command like `bash -c 'rm -rf ~'` as their "compiler", which will execute. This is an intentional design (power users), but it should at minimum be **documented** as a trust-boundary decision.

---

### 14. `/proc/<pid>/status` read not rate-limited after OLE kill
**File**: [extension.ts](file:///home/adistro/Documents/cp/src/extension.ts#L551-L591)

After `isOLE = true` and `child.kill('SIGKILL')`, the `memPoller` interval is NOT cleared immediately — it keeps firing until the `close` event fires and `clearInterval` is called. Between the kill and the close, up to 2–3 interval ticks can still call `readFileSync` on a potentially-dying process. This is safe because of the `try/catch`, but wastes cycles.

**Fix**: `clearInterval(memPoller)` immediately after calling `child.kill` on OLE.

---

### 15. `workspaceState` stores raw `actualOutput` (potentially huge)
**File**: [extension.ts](file:///home/adistro/Documents/cp/src/extension.ts#L739-L741)

After a run, `_persistTestCases` saves the full `actualOutput` (up to 1 MB per test case) to `workspaceState`. With 20 test cases, that's up to 20 MB of JSON in VS Code's sqlite-backed workspace state — far exceeding what it's designed for.

**Fix**: Strip `actualOutput`, `stderrOutput`, and `errorMessage` before persisting. These are ephemeral run results, not durable data.

```ts
private _persistTestCases() {
  if (!this._activeSourceFile) { return; }
  const stripped = this._testCases.map(({ id, input, expectedOutput }) => ({
    id, input, expectedOutput, status: 'Idle' as const
  }));
  this._testCasesMap[this._activeSourceFile] = stripped;
  this._context.workspaceState.update('cp-testcases-map', JSON.stringify(this._testCasesMap));
}
```

---

### 16. No sanitization on `sanitizedName` before `readdir` comparison
**File**: [extension.ts](file:///home/adistro/Documents/cp/src/extension.ts#L135)

```ts
const sanitizedName = payload.name.replace(/[<>:"/\\|?*]+/g, '_').trim();
```
The regex strips common forbidden characters, but doesn't handle:
- Leading dots (`.hidden`)
- Path traversal after sanitization: a name like `foo/../bar` → `foo/__bar` (OK here since `_` replaces `/`)
- Null bytes in problem names (unlikely from CC, but defensive coding should strip `\0`)

---

### 17. `generateSimpleId()` uses `Math.random()` — not cryptographically secure
**File**: [webhookListener.ts](file:///home/adistro/Documents/cp/src/webhookListener.ts#L250-L253)

```ts
function generateSimpleId(): string {
  const hex = (n: number) => Math.floor(Math.random() * (16 ** n)).toString(16).padStart(n, '0');
  return `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`;
}
```
`Math.random()` is not cryptographically secure. For batch IDs this is low risk, but the function also produces IDs that can collide more easily. Since `crypto.randomUUID` is available in Node.js 14.17+, this fallback function (which is never actually needed — the extension already imports `crypto`) should be replaced.

**Fix**: Use `require('crypto').randomUUID()` here too.

---

## 🏗 Reliability

### 18. Race condition: `runAllTests` called while a compile is in progress
**File**: [extension.ts](file:///home/adistro/Documents/cp/src/extension.ts#L312-L316)

```ts
if (this._runningProcesses.size > 0) {
  this.stopExecution();
  await new Promise(r => setTimeout(r, 50));
}
```
The 50ms sleep is a fragile heuristic. If the compiler takes longer than 50ms to die (e.g. slow disk, many files), the new run starts before the old one is fully torn down. This can lead to two concurrent compilations writing to the same binary path.

**Fix**: Use a proper `Promise` or cancellation token that resolves when all processes in `_runningProcesses` have exited, rather than a fixed timeout.

---

### 19. `setTimeout(() => _updateActiveSourceFile(), 500)` fires even after dispose
**File**: [extension.ts](file:///home/adistro/Documents/cp/src/extension.ts#L103)

```ts
setTimeout(() => this._updateActiveSourceFile(true), 500);
```
If the extension is deactivated within 500ms of activation (e.g. VS Code restart), this timer fires on a torn-down provider. The timer reference is not stored, so it cannot be cancelled.

**Fix**: Store the `setTimeout` return value and cancel it on `dispose`.

---

### 20. `webhookListener` error event is not handled by default — can crash the process
**File**: [webhookListener.ts](file:///home/adistro/Documents/cp/src/webhookListener.ts) / [extension.ts L198-L200](file:///home/adistro/Documents/cp/src/extension.ts#L198-L200)

Node `EventEmitter` throws unhandled `error` events. The extension adds a handler:
```ts
this._webhookListener.on('error', (err) => { console.error(...); });
```
This is correct, but if `error` is ever emitted *before* this listener is registered (e.g. `start()` throws synchronously before the `.on('error', ...)` line), it would crash. The current code registers the error handler after `start()` is called — however `start()` is async and errors are emitted asynchronously, so in practice it's fine. Still, register the `error` handler **before** calling `start()` for defensive ordering.

---

### 21. Batch accumulator timer leaks on `reconfigure`
**File**: [webhookListener.ts](file:///home/adistro/Documents/cp/src/webhookListener.ts#L305-L313)

```ts
async reconfigure(patch) {
  const oldPort = this._config.port;
  this._config = { ...this._config, ...patch };
  if (this.isListening && patch.port !== undefined && patch.port !== oldPort) {
    await this.stop();
    await this.start();
  }
}
```
`stop()` correctly clears all batch timers. But `reconfigure()` also mutates `batchTimeoutMs` without restarting. If a batch was accumulating with a 30s timeout and `batchTimeoutMs` is changed to 5s, the old timer still fires after 30s. This is a minor edge case but worth noting.

---

## 📈 Scalability

### 22. `_testCasesMap` grows unbounded
**File**: [extension.ts](file:///home/adistro/Documents/cp/src/extension.ts#L83)

```ts
private _testCasesMap: Record<string, TestCase[]> = {};
```
Every file the user opens and adds test cases to is stored indefinitely. In a long-running session, `_testCasesMap` can accumulate hundreds of file entries with their test case outputs in memory. No eviction or pruning strategy exists.

**Fix**: Cap the map to the N most-recently-accessed files (e.g. 50), or only keep entries whose files still exist on disk.

---

### 23. `maxWorkers` up to 16 with no OS thread limit awareness
**File**: [extension.ts](file:///home/adistro/Documents/cp/src/extension.ts#L386)

```ts
const workerCount = Math.min(config.maxWorkers, queue.length);
```
16 concurrent compiled processes can be spawned. On a system with 2 logical cores, this thrashes the scheduler and typically produces *worse* throughput than 2–4 workers. The default 4 is sensible, but the UI should warn if `maxWorkers > os.cpus().length`.

---

### 24. `collapseAll` sets state inside `setTestCases` callback (mixed state concern)
**File**: [App.tsx](file:///home/adistro/Documents/cp/src/webview/App.tsx#L76-L87)

```ts
case 'collapseAll':
  setTestCases(prev => {
    const nextExpanded: Record<string, boolean> = {};
    prev.forEach(t => { nextExpanded[t.id] = false; });
    setExpandedCards(nextExpanded);   // ← side effect inside state updater!
    return prev;
  });
```
Calling `setExpandedCards` inside a `setTestCases` updater function is a React anti-pattern. React's `StrictMode` and concurrent features call updaters multiple times for purity checks. This can result in `setExpandedCards` being called twice.

**Fix**: Separate the two state updates:
```ts
case 'collapseAll':
  setRunning(true);
  setIsConfigOpen(false);
  setExpandedCards(prev => {
    const collapsed: Record<string, boolean> = {};
    Object.keys(prev).forEach(k => { collapsed[k] = false; });
    return collapsed;
  });
  break;
```

---

### 25. `package.json` missing `ui.fontSize` in `contributes.configuration`
**File**: [package.json](file:///home/adistro/Documents/cp/package.json#L96-L211)

The `fontSize` config key (`cphSuccessor.ui.fontSize`) is used in both `extension.ts` and the webview but is **not declared** in `contributes.configuration`. This means:
- It won't appear in VS Code settings UI
- It won't have a schema-validated default
- `vscode.workspace.getConfiguration` will always return the code-default (12) rather than any persisted user value on first load

**Fix**: Add to `contributes.configuration.properties`:
```json
"cphSuccessor.ui.fontSize": {
  "type": "integer",
  "default": 12,
  "minimum": 8,
  "maximum": 24,
  "description": "Font size (px) for input/output textareas in the CP Runner panel."
}
```

---

## Summary Table

| # | Severity | Category | File | Description |
|---|----------|----------|------|-------------|
| 1 | 🟡 Medium | Bug | extension.ts | `fileSupported` hardcoded `true` in `_sendStateToWebview` |
| 2 | 🟢 Low | Bug | App.tsx | `triggerStop` sets running=false before backend confirms |
| 3 | 🟡 Medium | Bug | TestCaseList.tsx | New cards start expanded due to inverted `!== false` check |
| 4 | 🟡 Medium | Bug | extension.ts | `autoSave` saves wrong editor, not active source file |
| 5 | 🟡 Medium | Bug | extension.ts | `stdin.write` not guarded against EPIPE on RTE |
| 6 | 🟠 High | Performance | extension.ts | `_persistTestCases` serializes full map on every test finish |
| 7 | 🟡 Medium | Bug | App.tsx | `testProgress` has no cap in React state (OLE can still bloat) |
| 8 | 🟢 Low | Performance | extension.ts | Full-array postMessage on every single test update |
| 9 | 🟢 Low | Performance | App.tsx | 5× O(n) filter passes per render — use `useMemo` |
| 10 | 🟡 Medium | Performance | extension.ts | `readFileSync` in hot 20ms MLE poller blocks event loop |
| 11 | 🟠 High | Performance/Safety | extension.ts | `execSync` on macOS MLE path blocks event loop |
| 12 | 🟢 Low | Reliability | extension.ts | Shared `_runningProcesses` set across concurrent runs |
| 13 | 🟢 Low | Safety | extension.ts | User-controlled compiler command (trust boundary doc gap) |
| 14 | 🟢 Low | Safety | extension.ts | MLE interval fires after OLE kill (wasted cycles) |
| 15 | 🔴 Critical | Safety | extension.ts | `actualOutput` (up to 1 MB × N) persisted to workspaceState |
| 16 | 🟢 Low | Safety | extension.ts | Null-byte not filtered in problem name sanitization |
| 17 | 🟢 Low | Safety | webhookListener.ts | `generateSimpleId` uses `Math.random()`, not `crypto` |
| 18 | 🟠 High | Reliability | extension.ts | 50ms sleep to wait for old process death — fragile heuristic |
| 19 | 🟢 Low | Reliability | extension.ts | 500ms deferred `_updateActiveSourceFile` not cancellable |
| 20 | 🟢 Low | Reliability | extension.ts | Error handler registered after `start()` (ordering concern) |
| 21 | 🟢 Low | Reliability | webhookListener.ts | Batch timer not reset on `batchTimeoutMs` reconfigure |
| 22 | 🟡 Medium | Scalability | extension.ts | `_testCasesMap` grows unbounded in memory |
| 23 | 🟢 Low | Scalability | extension.ts | No warning when `maxWorkers` > CPU count |
| 24 | 🟡 Medium | Bug/Scalability | App.tsx | `setExpandedCards` called inside `setTestCases` updater |
| 25 | 🟠 High | Bug | package.json | `cphSuccessor.ui.fontSize` not declared in contributes |
