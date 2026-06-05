"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
function diffChars(oldStr, newStr) {
    if (oldStr.length > 2500 || newStr.length > 2500) {
        return [
            { value: oldStr, removed: true },
            { value: newStr, added: true }
        ];
    }
    // 1. Identify common prefix
    let commonPrefixLen = 0;
    const minLen = Math.min(oldStr.length, newStr.length);
    while (commonPrefixLen < minLen && oldStr[commonPrefixLen] === newStr[commonPrefixLen]) {
        commonPrefixLen++;
    }
    // 2. Identify common suffix (excluding the common prefix area)
    let commonSuffixLen = 0;
    const maxSuffixLen = minLen - commonPrefixLen;
    while (commonSuffixLen < maxSuffixLen &&
        oldStr[oldStr.length - 1 - commonSuffixLen] === newStr[newStr.length - 1 - commonSuffixLen]) {
        commonSuffixLen++;
    }
    const prefixStr = oldStr.substring(0, commonPrefixLen);
    const suffixStr = oldStr.substring(oldStr.length - commonSuffixLen);
    const midOld = oldStr.substring(commonPrefixLen, oldStr.length - commonSuffixLen);
    const midNew = newStr.substring(commonPrefixLen, newStr.length - commonSuffixLen);
    const midDiffs = [];
    if (midOld.length > 0 || midNew.length > 0) {
        const m = midOld.length;
        const n = midNew.length;
        // Space optimized: flat Int32Array is super fast and clean in V8
        const dp = new Int32Array((m + 1) * (n + 1));
        for (let i = 1; i <= m; i++) {
            const rowOffset = i * (n + 1);
            const prevRowOffset = (i - 1) * (n + 1);
            const charOld = midOld[i - 1];
            for (let j = 1; j <= n; j++) {
                if (charOld === midNew[j - 1]) {
                    dp[rowOffset + j] = dp[prevRowOffset + j - 1] + 1;
                }
                else {
                    const val1 = dp[prevRowOffset + j];
                    const val2 = dp[rowOffset + j - 1];
                    dp[rowOffset + j] = val1 > val2 ? val1 : val2;
                }
            }
        }
        let i = m;
        let j = n;
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && midOld[i - 1] === midNew[j - 1]) {
                midDiffs.unshift({ value: midOld[i - 1] });
                i--;
                j--;
            }
            else if (j > 0 && (i === 0 || dp[i * (n + 1) + j - 1] >= dp[(i - 1) * (n + 1) + j])) {
                midDiffs.unshift({ value: midNew[j - 1], added: true });
                j--;
            }
            else {
                midDiffs.unshift({ value: midOld[i - 1], removed: true });
                i--;
            }
        }
    }
    const result = [];
    if (prefixStr) {
        result.push({ value: prefixStr });
    }
    result.push(...midDiffs);
    if (suffixStr) {
        result.push({ value: suffixStr });
    }
    // Combine consecutive tokens of same type (added, removed, or unchanged) to reduce DOM node counts significantly
    const optimizedResult = [];
    for (const token of result) {
        const last = optimizedResult[optimizedResult.length - 1];
        if (last && !!last.added === !!token.added && !!last.removed === !!token.removed) {
            last.value += token.value;
        }
        else {
            optimizedResult.push(token);
        }
    }
    return optimizedResult;
}
function App() {
    const [testCases, setTestCases] = (0, react_1.useState)([]);
    const [activeFile, setActiveFile] = (0, react_1.useState)('No file open');
    const [isConfigOpen, setIsConfigOpen] = (0, react_1.useState)(false);
    const [running, setRunning] = (0, react_1.useState)(false);
    const [expandedCards, setExpandedCards] = (0, react_1.useState)({});
    const [compileErrDismissed, setCompileErrDismissed] = (0, react_1.useState)(false);
    // Engine configuration panel settings
    const [config, setConfig] = (0, react_1.useState)({
        timeLimit: 2000,
        memoryLimit: 256,
        cppFlags: '-O3 -std=c++20 -Wshadow',
        javaFlags: '',
        ignoreTrailingWhitespace: true,
        ignoreSystemLineEndings: true,
        floatTolerance: false,
        floatEpsilon: 0.000001,
        maxWorkers: 4,
        autoSave: true,
        autoClearConsole: true,
        cppCommand: 'g++',
        pythonCommand: 'python3'
    });
    // Update state locally for instant UI feedback (zero-lag slider drag)
    const setConfigLocal = (updatedFields) => {
        setConfig(prev => ({ ...prev, ...updatedFields }));
    };
    // Persist state to VS Code backend when user finishes interacting (mouseUp or blur)
    const persistConfig = (updatedFields) => {
        setConfig(prev => {
            const updated = { ...prev, ...updatedFields };
            vscode.postMessage({ type: 'updateConfig', config: updated });
            return updated;
        });
    };
    // Track global runner state
    (0, react_1.useEffect)(() => {
        // Listen to messages from VS Code extension backend
        const handleMessage = (event) => {
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
                    setTestCases(prev => {
                        const nextExpanded = {};
                        prev.forEach(t => {
                            nextExpanded[t.id] = false;
                        });
                        setExpandedCards(nextExpanded);
                        return prev;
                    });
                    break;
                case 'testProgress':
                    setTestCases(prev => prev.map(t => {
                        if (t.id === message.id) {
                            return { ...t, actualOutput: (t.actualOutput || '') + message.chunk };
                        }
                        return t;
                    }));
                    break;
                case 'executionFinished':
                    setRunning(false);
                    setCompileErrDismissed(false); // Reset dismiss on each new run
                    // Expand only failed/errored test cases after run completes
                    setTestCases(prev => {
                        const failedStatuses = new Set(['Failed', 'TLE', 'MLE', 'RTE', 'CompilationError']);
                        const nextExpanded = {};
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
            const collapsed = {};
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
        setRunning(false);
    };
    const addTestCase = () => {
        vscode.postMessage({ type: 'addTest' });
    };
    const deleteTestCase = (id) => {
        vscode.postMessage({ type: 'deleteTest', id });
    };
    const updateTestCase = (id, updatedFields) => {
        const updated = testCases.map(t => t.id === id ? { ...t, ...updatedFields } : t);
        setTestCases(updated);
        vscode.postMessage({ type: 'saveTests', testCases: updated });
    };
    const toggleCard = (id) => {
        setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
    };
    // Status breakdown calculations
    const stats = {
        passed: testCases.filter(t => t.status === 'Passed').length,
        failed: testCases.filter(t => t.status === 'Failed').length,
        tle: testCases.filter(t => t.status === 'TLE').length,
        mle: testCases.filter(t => t.status === 'MLE').length,
        rte: testCases.filter(t => t.status === 'RTE').length,
        compError: testCases.filter(t => t.status === 'CompilationError').length,
        total: testCases.length
    };
    // Find global compilation error (same message for all tests, show once)
    const compilationError = testCases.find(t => t.status === 'CompilationError' && t.errorMessage)?.errorMessage;
    return (react_1.default.createElement("div", { className: "flex flex-col space-y-2 w-full flex-1 min-h-0 text-vs-fg" },
        react_1.default.createElement("div", { className: "glass-card rounded-xl p-2.5 xs:p-3 flex flex-col space-y-2 shadow-lg relative overflow-hidden border border-white/5" },
            react_1.default.createElement("div", { className: "absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-xl pointer-events-none" }),
            react_1.default.createElement("div", { className: "flex flex-col xs:flex-row xs:items-center justify-between gap-2 z-10" },
                react_1.default.createElement("div", null,
                    react_1.default.createElement("h1", { className: "text-xs font-bold tracking-wider text-white flex items-center gap-1.5 font-sans uppercase" },
                        react_1.default.createElement("span", { className: "w-2 h-2 bg-blue-500 rounded-full animate-pulse" }),
                        "CP Runner"),
                    react_1.default.createElement("p", { className: "text-[9px] text-zinc-400 font-mono mt-0.5 max-w-full truncate", title: activeFile }, activeFile)),
                react_1.default.createElement("div", { className: "flex items-center gap-1.5 shrink-0" },
                    react_1.default.createElement("button", { onClick: () => setIsConfigOpen(!isConfigOpen), className: `p-2 rounded-lg hover:bg-white/5 border border-white/5 transition-all ${isConfigOpen ? 'bg-white/10 text-white border-white/10' : 'text-zinc-400'}`, title: "Toggle Configuration" },
                        react_1.default.createElement("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" },
                            react_1.default.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" }),
                            react_1.default.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z" }))),
                    running ? (react_1.default.createElement("button", { onClick: triggerStop, className: "px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition-all shadow-[0_0_15px_rgba(225,29,72,0.4)] flex items-center gap-1.5 text-xs" },
                        react_1.default.createElement("span", { className: "w-2 h-2 bg-white rounded-full animate-ping" }),
                        "Stop")) : (react_1.default.createElement("button", { onClick: triggerRunAll, className: "px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center gap-1.5 text-xs", disabled: testCases.length === 0 },
                        react_1.default.createElement("svg", { className: "w-3.5 h-3.5", viewBox: "0 0 20 20", fill: "currentColor" },
                            react_1.default.createElement("path", { fillRule: "evenodd", d: "M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z", clipRule: "evenodd" })),
                        "Run All")))),
            react_1.default.createElement("div", { className: "flex items-center gap-1 font-mono text-[10px] mt-1" },
                [
                    { label: 'PASS', val: stats.passed, color: 'text-emerald-400', bg: 'bg-emerald-950/20 border-emerald-500/15' },
                    { label: 'FAIL', val: stats.failed, color: 'text-rose-400', bg: 'bg-rose-950/20 border-rose-500/15' },
                    { label: 'TLE', val: stats.tle, color: 'text-amber-400', bg: 'bg-amber-950/20 border-amber-500/15' },
                    { label: 'MLE', val: stats.mle, color: 'text-orange-400', bg: 'bg-orange-950/20 border-orange-500/15' },
                    { label: 'RTE', val: stats.rte, color: 'text-purple-400', bg: 'bg-purple-950/20 border-purple-500/15' },
                ].map(s => (react_1.default.createElement("div", { key: s.label, className: `flex items-center gap-1 px-1.5 py-0.5 rounded border ${s.bg}` },
                    react_1.default.createElement("span", { className: "text-zinc-500" }, s.label),
                    react_1.default.createElement("span", { className: `font-bold ${s.color}` }, s.val)))),
                react_1.default.createElement("div", { className: "ml-auto text-zinc-500" },
                    stats.total,
                    " test",
                    stats.total !== 1 ? 's' : ''))),
        isConfigOpen && (react_1.default.createElement("div", { className: "glass-card rounded-xl p-3 xs:p-4 border border-blue-500/10 shadow-lg space-y-4 max-h-[60vh] overflow-y-auto" },
            react_1.default.createElement("div", { className: "flex items-center justify-between border-b border-white/5 pb-2" },
                react_1.default.createElement("h2", { className: "text-xs font-bold uppercase tracking-wider text-blue-400" }, "Engine Configuration"),
                react_1.default.createElement("button", { onClick: () => setIsConfigOpen(false), className: "text-zinc-500 hover:text-zinc-300" }, "\u2715")),
            react_1.default.createElement("div", { className: "pt-1" },
                react_1.default.createElement("button", { onClick: () => vscode.postMessage({ type: 'openKeybindings' }), className: "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 hover:text-blue-300 transition-all font-mono text-[11px] group" },
                    react_1.default.createElement("span", { className: "flex items-center gap-2" },
                        react_1.default.createElement("svg", { className: "w-3.5 h-3.5 shrink-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" },
                            react_1.default.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" })),
                        react_1.default.createElement("span", { className: "font-semibold" }, "Customize Run Keyboard Shortcut"),
                        react_1.default.createElement("span", { className: "text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 font-mono text-blue-400" }, "Ctrl+Alt+R")),
                    react_1.default.createElement("svg", { className: "w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity shrink-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" },
                        react_1.default.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" })))),
            react_1.default.createElement("div", { className: "space-y-3 font-mono text-[11px]" },
                react_1.default.createElement("div", { className: "grid grid-cols-1 xs:grid-cols-2 gap-3" },
                    react_1.default.createElement("div", null,
                        react_1.default.createElement("label", { className: "block text-zinc-400 mb-1" },
                            "TIME LIMIT: ",
                            react_1.default.createElement("span", { className: "text-white font-bold" },
                                config.timeLimit,
                                "ms")),
                        react_1.default.createElement("input", { type: "range", min: "50", max: "10000", step: "50", value: config.timeLimit, onChange: (e) => setConfigLocal({ timeLimit: parseInt(e.target.value) }), onMouseUp: (e) => persistConfig({ timeLimit: parseInt(e.currentTarget.value) }), onTouchEnd: (e) => persistConfig({ timeLimit: parseInt(e.currentTarget.value) }), className: "w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500" })),
                    react_1.default.createElement("div", null,
                        react_1.default.createElement("label", { className: "block text-zinc-400 mb-1" },
                            "MEMORY LIMIT: ",
                            react_1.default.createElement("span", { className: "text-white font-bold" },
                                config.memoryLimit,
                                "MB")),
                        react_1.default.createElement("input", { type: "range", min: "16", max: "2048", step: "16", value: config.memoryLimit, onChange: (e) => setConfigLocal({ memoryLimit: parseInt(e.target.value) }), onMouseUp: (e) => persistConfig({ memoryLimit: parseInt(e.currentTarget.value) }), onTouchEnd: (e) => persistConfig({ memoryLimit: parseInt(e.currentTarget.value) }), className: "w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500" }))),
                react_1.default.createElement("div", { className: "space-y-2" },
                    react_1.default.createElement("div", null,
                        react_1.default.createElement("label", { className: "block text-zinc-400 mb-0.5" }, "C++ COMPILER FLAGS"),
                        react_1.default.createElement("input", { type: "text", value: config.cppFlags, onChange: (e) => setConfigLocal({ cppFlags: e.target.value }), onBlur: (e) => persistConfig({ cppFlags: e.target.value }), className: "w-full bg-zinc-950/50 border border-white/5 rounded p-1.5 font-mono text-[11px] text-white focus:outline-none focus:border-blue-500/50" })),
                    react_1.default.createElement("div", null,
                        react_1.default.createElement("label", { className: "block text-zinc-400 mb-0.5" }, "JAVA COMPILER FLAGS"),
                        react_1.default.createElement("input", { type: "text", value: config.javaFlags, onChange: (e) => setConfigLocal({ javaFlags: e.target.value }), onBlur: (e) => persistConfig({ javaFlags: e.target.value }), className: "w-full bg-zinc-950/50 border border-white/5 rounded p-1.5 font-mono text-[11px] text-white focus:outline-none focus:border-blue-500/50" }))),
                react_1.default.createElement("div", { className: "grid grid-cols-1 xs:grid-cols-2 gap-3 pt-1 border-t border-white/5" },
                    react_1.default.createElement("div", null,
                        react_1.default.createElement("label", { className: "block text-zinc-400 mb-1" },
                            "MAX CONCURRENCY: ",
                            react_1.default.createElement("span", { className: "text-white font-bold" }, config.maxWorkers)),
                        react_1.default.createElement("input", { type: "range", min: "1", max: "16", step: "1", value: config.maxWorkers, onChange: (e) => setConfigLocal({ maxWorkers: parseInt(e.target.value) }), onMouseUp: (e) => persistConfig({ maxWorkers: parseInt(e.currentTarget.value) }), onTouchEnd: (e) => persistConfig({ maxWorkers: parseInt(e.currentTarget.value) }), className: "w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500" })),
                    react_1.default.createElement("div", { className: "space-y-1.5 flex flex-col justify-end" },
                        react_1.default.createElement("label", { className: "flex items-center gap-1.5 cursor-pointer text-zinc-300" },
                            react_1.default.createElement("input", { type: "checkbox", checked: config.ignoreTrailingWhitespace, onChange: (e) => persistConfig({ ignoreTrailingWhitespace: e.target.checked }), className: "rounded border-white/5 bg-zinc-900 text-blue-600 focus:ring-0 focus:ring-offset-0" }),
                            "Ignore Whitespace"),
                        react_1.default.createElement("label", { className: "flex items-center gap-1.5 cursor-pointer text-zinc-300" },
                            react_1.default.createElement("input", { type: "checkbox", checked: config.ignoreSystemLineEndings, onChange: (e) => persistConfig({ ignoreSystemLineEndings: e.target.checked }), className: "rounded border-white/5 bg-zinc-900 text-blue-600 focus:ring-0 focus:ring-offset-0" }),
                            "Ignore \\\\r\\\\n Endings"))),
                react_1.default.createElement("div", { className: "grid grid-cols-2 gap-3 pt-2 border-t border-white/5" },
                    react_1.default.createElement("label", { className: "flex items-center gap-1.5 cursor-pointer text-zinc-300" },
                        react_1.default.createElement("input", { type: "checkbox", checked: config.floatTolerance, onChange: (e) => persistConfig({ floatTolerance: e.target.checked }), className: "rounded border-white/5 bg-zinc-900 text-blue-600 focus:ring-0 focus:ring-offset-0" }),
                        "Float Tolerance Epsilon"),
                    config.floatTolerance && (react_1.default.createElement("input", { type: "number", step: "0.000001", value: config.floatEpsilon, onChange: (e) => setConfigLocal({ floatEpsilon: parseFloat(e.target.value) || 0.000001 }), onBlur: (e) => persistConfig({ floatEpsilon: parseFloat(e.target.value) || 0.000001 }), className: "bg-zinc-950/50 border border-white/5 rounded p-1 font-mono text-[11px] text-white focus:outline-none focus:border-blue-500/50 w-24 ml-auto" }))),
                react_1.default.createElement("div", { className: "pt-2 border-t border-white/5 space-y-2" },
                    react_1.default.createElement("div", { className: "text-[9px] text-zinc-500 font-bold uppercase tracking-wider pb-0.5" }, "Workflow"),
                    react_1.default.createElement("label", { className: "flex items-center gap-1.5 cursor-pointer text-zinc-300" },
                        react_1.default.createElement("input", { type: "checkbox", checked: config.autoSave, onChange: (e) => persistConfig({ autoSave: e.target.checked }), className: "rounded border-white/5 bg-zinc-900 text-blue-600 focus:ring-0 focus:ring-offset-0" }),
                        "Auto-Save Before Run"),
                    react_1.default.createElement("label", { className: "flex items-center gap-1.5 cursor-pointer text-zinc-300" },
                        react_1.default.createElement("input", { type: "checkbox", checked: config.autoClearConsole, onChange: (e) => persistConfig({ autoClearConsole: e.target.checked }), className: "rounded border-white/5 bg-zinc-900 text-blue-600 focus:ring-0 focus:ring-offset-0" }),
                        "Auto-Clear Outputs on Run")),
                react_1.default.createElement("div", { className: "pt-2 border-t border-white/5 space-y-2" },
                    react_1.default.createElement("div", { className: "text-[9px] text-zinc-500 font-bold uppercase tracking-wider pb-0.5" }, "Custom Commands"),
                    react_1.default.createElement("div", { className: "grid grid-cols-1 xs:grid-cols-2 gap-2" },
                        react_1.default.createElement("div", null,
                            react_1.default.createElement("label", { className: "block text-zinc-400 mb-0.5" }, "C++ COMPILER"),
                            react_1.default.createElement("input", { type: "text", value: config.cppCommand, onChange: (e) => setConfigLocal({ cppCommand: e.target.value }), onBlur: (e) => persistConfig({ cppCommand: e.target.value }), placeholder: "g++", className: "w-full bg-zinc-950/50 border border-white/5 rounded p-1.5 font-mono text-[11px] text-white focus:outline-none focus:border-blue-500/50" })),
                        react_1.default.createElement("div", null,
                            react_1.default.createElement("label", { className: "block text-zinc-400 mb-0.5" }, "PYTHON COMMAND"),
                            react_1.default.createElement("input", { type: "text", value: config.pythonCommand, onChange: (e) => setConfigLocal({ pythonCommand: e.target.value }), onBlur: (e) => persistConfig({ pythonCommand: e.target.value }), placeholder: "python3", className: "w-full bg-zinc-950/50 border border-white/5 rounded p-1.5 font-mono text-[11px] text-white focus:outline-none focus:border-blue-500/50" }))))))),
        compilationError && !compileErrDismissed && (react_1.default.createElement("div", { className: "bg-red-950/30 border border-red-500/25 rounded-lg p-2.5 font-mono text-[10.5px] text-red-300 select-text" },
            react_1.default.createElement("div", { className: "flex items-center justify-between border-b border-red-500/15 pb-1 mb-1.5" },
                react_1.default.createElement("span", { className: "font-bold text-[10px] uppercase tracking-wider text-red-400" }, "\u26A0 Compilation Failed"),
                react_1.default.createElement("button", { onClick: () => setCompileErrDismissed(true), className: "text-red-500 hover:text-red-300 transition-colors text-xs leading-none px-1", title: "Dismiss" }, "\u2715")),
            react_1.default.createElement("pre", { className: "whitespace-pre-wrap leading-relaxed" }, compilationError))),
        react_1.default.createElement("div", { className: "flex items-center justify-between border-b border-white/5 pb-1.5" },
            react_1.default.createElement("h2", { className: "text-[10px] font-bold uppercase tracking-wider text-zinc-500" },
                "Test Cases (",
                testCases.length,
                ")"),
            react_1.default.createElement("button", { onClick: addTestCase, className: "text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 font-semibold border border-white/5 transition-all text-white flex items-center gap-1" },
                react_1.default.createElement("span", null, "+"),
                " Add")),
        react_1.default.createElement("div", { className: "space-y-2 overflow-y-auto flex-1 min-h-0 pr-1" }, testCases.map((test, index) => {
            const isExpanded = expandedCards[test.id] !== false; // Expand by default
            // Badge layout mapping based on status
            const statusBadge = () => {
                switch (test.status) {
                    case 'Passed':
                        return react_1.default.createElement("span", { className: "text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono font-semibold border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]" }, "PASSED");
                    case 'Failed':
                        return react_1.default.createElement("span", { className: "text-[10px] px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 font-mono font-semibold border border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]" }, "FAILED");
                    case 'Running':
                        return (react_1.default.createElement("span", { className: "text-[10px] px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 font-mono font-semibold border border-blue-500/20 flex items-center gap-1 shadow-[0_0_10px_rgba(59,130,246,0.1)]" },
                            react_1.default.createElement("svg", { className: "animate-spin h-2.5 w-2.5", fill: "none", viewBox: "0 0 24 24" },
                                react_1.default.createElement("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }),
                                react_1.default.createElement("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" })),
                            "RUNNING"));
                    case 'Compiling':
                        return react_1.default.createElement("span", { className: "text-[10px] px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-400 font-mono font-semibold border border-indigo-500/20 animate-pulse" }, "COMPILING");
                    case 'TLE':
                        return react_1.default.createElement("span", { className: "text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 font-mono font-semibold border border-amber-500/20" }, "TLE");
                    case 'MLE':
                        return react_1.default.createElement("span", { className: "text-[10px] px-2 py-0.5 rounded bg-orange-500/15 text-orange-400 font-mono font-semibold border border-orange-500/20" }, "MLE");
                    case 'RTE':
                        return react_1.default.createElement("span", { className: "text-[10px] px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 font-mono font-semibold border border-purple-500/20" }, "RTE");
                    case 'CompilationError':
                        return react_1.default.createElement("span", { className: "text-[10px] px-2 py-0.5 rounded bg-red-600/25 text-red-300 font-mono font-semibold border border-red-500/20" }, "COMPILE ERR");
                    default:
                        return react_1.default.createElement("span", { className: "text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono font-semibold border border-white/5" }, "IDLE");
                }
            };
            return (react_1.default.createElement("div", { key: test.id, className: `glass-card rounded-xl border transition-all ${test.status === 'Passed' ? 'border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.03)]' :
                    test.status === 'Failed' ? 'border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.03)]' :
                        test.status === 'Running' ? 'border-blue-500/25 bg-blue-500/[0.01]' : 'border-white/5'}` },
                react_1.default.createElement("div", { onClick: () => toggleCard(test.id), className: "flex items-center gap-1.5 px-2.5 py-2 cursor-pointer hover:bg-white/[0.02] transition-all rounded-t-xl" },
                    react_1.default.createElement("svg", { className: `w-3 h-3 text-zinc-500 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" },
                        react_1.default.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 5l7 7-7 7" })),
                    react_1.default.createElement("span", { className: "font-bold text-white text-[11px] truncate" },
                        "Test #",
                        index + 1),
                    statusBadge(),
                    test.executionTime !== undefined && test.executionTime > 0 && (react_1.default.createElement("span", { className: "font-mono text-[9px] text-zinc-500 px-1 py-0.5 rounded bg-zinc-900/80 border border-white/5" },
                        test.executionTime,
                        "ms")),
                    test.memoryUsage !== undefined && test.memoryUsage > 0 && (react_1.default.createElement("span", { className: "font-mono text-[9px] text-zinc-500 px-1 py-0.5 rounded bg-zinc-900/80 border border-white/5" },
                        test.memoryUsage,
                        "MB")),
                    react_1.default.createElement("button", { onClick: (e) => {
                            e.stopPropagation();
                            deleteTestCase(test.id);
                        }, className: "ml-auto p-0.5 hover:text-rose-400 hover:bg-white/5 rounded transition-all shrink-0", title: "Delete Test Case" },
                        react_1.default.createElement("svg", { className: "w-3 h-3", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" },
                            react_1.default.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" })))),
                isExpanded && (react_1.default.createElement("div", { className: "px-2.5 pb-2.5 pt-0 border-t border-white/5 space-y-2 font-sans text-xs" },
                    test.status === 'RTE' && test.errorMessage && (react_1.default.createElement("div", { className: "mt-2 bg-purple-950/20 border border-purple-500/20 p-2 rounded-lg text-purple-300 font-mono text-[10px] whitespace-pre-wrap select-text" },
                        react_1.default.createElement("div", { className: "font-bold border-b border-purple-500/10 pb-0.5 mb-1 text-[9.5px] uppercase tracking-wider" }, "Runtime Error:"),
                        test.errorMessage)),
                    react_1.default.createElement("div", { className: "grid grid-cols-1 xs:grid-cols-2 gap-2 mt-2" },
                        react_1.default.createElement("div", { className: "flex flex-col space-y-0.5" },
                            react_1.default.createElement("span", { className: "text-[9.5px] text-zinc-500 font-bold uppercase tracking-wider" }, "Input"),
                            react_1.default.createElement("textarea", { value: test.input, onChange: (e) => updateTestCase(test.id, { input: e.target.value }), className: "w-full bg-zinc-950/70 border border-white/5 rounded-lg p-2 font-mono text-[10.5px] text-white focus:outline-none focus:border-blue-500/50 resize-y h-24 min-h-[60px] select-text scrollbar-none", style: { scrollbarWidth: 'none', msOverflowStyle: 'none' }, placeholder: "stdin..." })),
                        react_1.default.createElement("div", { className: "flex flex-col space-y-0.5" },
                            react_1.default.createElement("span", { className: "text-[9.5px] text-zinc-500 font-bold uppercase tracking-wider" }, "Expected"),
                            react_1.default.createElement("textarea", { value: test.expectedOutput, onChange: (e) => updateTestCase(test.id, { expectedOutput: e.target.value }), className: "w-full bg-zinc-950/70 border border-white/5 rounded-lg p-2 font-mono text-[10.5px] text-white focus:outline-none focus:border-blue-500/50 resize-y h-24 min-h-[60px] select-text scrollbar-none", style: { scrollbarWidth: 'none', msOverflowStyle: 'none' }, placeholder: "expected stdout..." }))),
                    (test.status === 'TLE' || test.status === 'MLE') && test.errorMessage && (react_1.default.createElement("div", { className: `p-2 rounded-lg font-mono text-[10px] whitespace-pre-wrap select-text border ${test.status === 'TLE'
                            ? 'bg-amber-950/20 border-amber-500/20 text-amber-300'
                            : 'bg-orange-950/20 border-orange-500/20 text-orange-300'}` },
                        react_1.default.createElement("div", { className: "font-bold text-[9.5px] uppercase tracking-wider border-b border-current/10 pb-0.5 mb-1 opacity-70" }, test.status === 'TLE' ? 'Time Limit Exceeded:' : 'Memory Limit Exceeded:'),
                        test.errorMessage)),
                    test.status !== 'Idle' && test.status !== 'Compiling' && test.status !== 'CompilationError' && (react_1.default.createElement("div", { className: "flex flex-col space-y-0.5 border-t border-white/5 pt-2" },
                        react_1.default.createElement("span", { className: "text-[9.5px] text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-1.5" },
                            "Actual Output",
                            test.status === 'Running' && (react_1.default.createElement("span", { className: "w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" }))),
                        react_1.default.createElement("pre", { className: "bg-zinc-950/90 border border-white/5 rounded-lg p-2 font-mono text-[10.5px] text-zinc-200 overflow-x-auto whitespace-pre-wrap min-h-[24px] max-h-32 select-text" }, test.actualOutput || (test.status === 'Running' ? 'Executing...' : 'No output.')))),
                    test.status !== 'Idle' && test.status !== 'Compiling' && test.status !== 'CompilationError' && test.stderrOutput && (react_1.default.createElement("div", { className: "flex flex-col space-y-0.5 border-t border-white/5 pt-2" },
                        react_1.default.createElement("span", { className: "text-[9.5px] text-purple-400 font-bold uppercase tracking-wider flex items-center gap-1.5" }, "Standard Error (cerr)"),
                        react_1.default.createElement("pre", { className: "bg-zinc-950/90 border border-purple-500/10 rounded-lg p-2 font-mono text-[10.5px] text-purple-300 overflow-x-auto whitespace-pre-wrap max-h-32 select-text" }, test.stderrOutput))),
                    test.status === 'Failed' && test.actualOutput !== undefined && (() => {
                        const isTooLarge = test.actualOutput.length > 1500 || test.expectedOutput.length > 1500;
                        const diff = diffChars(test.actualOutput, test.expectedOutput);
                        return (react_1.default.createElement("div", { className: "border border-rose-500/10 bg-rose-500/[0.01] rounded-lg p-2.5 mt-1 space-y-1.5" },
                            react_1.default.createElement("div", { className: "text-[9.5px] font-bold text-rose-400 uppercase tracking-wider flex items-center justify-between border-b border-rose-500/10 pb-1" },
                                react_1.default.createElement("span", null, "Diff (LCS char-level)"),
                                isTooLarge && (react_1.default.createElement("span", { className: "text-[9px] text-amber-400 font-mono bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-500/20 animate-pulse" }, "simplified"))),
                            react_1.default.createElement("div", { className: "grid grid-cols-1 xs:grid-cols-2 gap-2 font-mono text-[10px]" },
                                react_1.default.createElement("div", { className: "flex flex-col space-y-0.5" },
                                    react_1.default.createElement("span", { className: "text-[9px] text-zinc-500 font-bold uppercase" }, "Expected"),
                                    react_1.default.createElement("div", { className: "bg-zinc-950/70 p-2 border border-white/5 rounded-lg overflow-x-auto whitespace-pre-wrap select-text leading-5 max-h-28" }, diff
                                        .filter(token => !token.removed)
                                        .map((token, i) => (react_1.default.createElement("span", { key: i, className: token.added ? 'bg-emerald-950/80 text-emerald-300 font-bold px-0.5 rounded border border-emerald-500/25' : '' }, token.value))))),
                                react_1.default.createElement("div", { className: "flex flex-col space-y-0.5" },
                                    react_1.default.createElement("span", { className: "text-[9px] text-zinc-500 font-bold uppercase" }, "Actual"),
                                    react_1.default.createElement("div", { className: "bg-zinc-950/70 p-2 border border-white/5 rounded-lg overflow-x-auto whitespace-pre-wrap select-text leading-5 max-h-28" }, diff
                                        .filter(token => !token.added)
                                        .map((token, i) => (react_1.default.createElement("span", { key: i, className: token.removed ? 'bg-rose-950/80 text-rose-300 font-bold px-0.5 rounded border border-rose-500/25 line-through decoration-rose-400/80' : '' }, token.value))))))));
                    })()))));
        })),
        testCases.length === 0 && (react_1.default.createElement("div", { className: "glass-card rounded-xl p-5 text-center border border-dashed border-white/10 space-y-1.5" },
            react_1.default.createElement("svg", { className: "w-6 h-6 text-zinc-600 mx-auto", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" },
                react_1.default.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 1.5, d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" })),
            react_1.default.createElement("div", { className: "text-zinc-400 font-bold text-xs" }, "No Test Cases"),
            react_1.default.createElement("div", { className: "text-[10px] text-zinc-500" }, "Click \"+ Add\" to add test inputs.")))));
}
exports.default = App;
//# sourceMappingURL=App.js.map