<div align="center">
  <h1>🏃‍♂️ CP Runner for VS Code</h1>
  <p><strong>A blazing-fast, feature-rich Competitive Programming test case runner for Visual Studio Code.</strong></p>
</div>

CP Runner is a robust Visual Studio Code extension designed for competitive programmers. It integrates seamlessly with [Competitive Companion](https://github.com/jmerle/competitive-companion) to parse problems and contests directly into your IDE, allowing you to run and verify test cases effortlessly. Stop copy-pasting inputs and outputs manually—let CP Runner automate your workflow so you can focus on solving the problem!

## ✨ Features

- **Competitive Companion Integration**: Listen and parse problem test cases automatically via a local webhook.
- **Multi-Language Support**: Run solutions in `C++`, `C`, `Java`, and `Python`.
- **Concurrent Execution**: Run multiple test cases in parallel using configurable worker threads, significantly reducing testing time.
- **Smart Diff Engine**: Compare expected and actual outputs with support for:
  - Ignoring trailing whitespaces
  - Normalizing line-endings (`\r\n` vs `\n`)
  - Float precision tolerance (epsilon comparison for geometry/probability problems)
- **Auto Run**: Optionally run test cases automatically every time you save your code.
- **Configurable Limits**: Set hard memory (MB) and time (ms) limits to detect memory leaks or TLEs (Time Limit Exceeded).
- **Custom Webview UI**: A beautiful, native-feeling Webview built with React and TailwindCSS for managing and viewing test case results right inside your editor.

---

## 📋 Prerequisites

Before using CP Runner, make sure you have the following installed based on the languages you intend to use:
- **C/C++**: `gcc`/`g++` installed and available in your system's PATH.
- **Python**: `python3` (or `python`) installed and available in PATH.
- **Java**: Java Development Kit (`javac` & `java`) installed and available in PATH.
- **Competitive Companion**: The browser extension installed in [Chrome](https://chrome.google.com/webstore/detail/competitive-companion/cjnmckjndlpiamhfimnnjmnckigdhcpa) or [Firefox](https://addons.mozilla.org/en-US/firefox/addon/competitive-companion/) to parse problems.

---

## 🚀 Installation

1. Open VS Code.
2. Go to the **Extensions** view (`Ctrl+Shift+X` / `Cmd+Shift+X`).
3. Search for `CP Runner` and click **Install**.
4. (Optional) Make sure the browser extension Competitive Companion is installed.

*If installing from a local `.vsix` file:*
1. Go to the Extensions view.
2. Click the `...` menu in the top right corner and select **"Install from VSIX..."**.
3. Select the downloaded `cp-runner-X.X.X.vsix` file.

---

## 📖 Usage Guide

### 1. Parsing a Problem
1. Open a problem on supported platforms (Codeforces, LeetCode, AtCoder, etc.) in your browser.
2. Click the **Competitive Companion** extension icon (the green plus sign) in your browser.
3. CP Runner will automatically receive the problem details, generate a source file, and populate the test cases in the CP Runner side panel.

### 2. Running Test Cases
1. Write your solution in the generated file.
2. Press `Ctrl+Alt+R` (or `Cmd+Alt+R` on Mac) to run the test cases.
3. View the results (Accepted, Wrong Answer, Time Limit Exceeded, Runtime Error, etc.) in the CP Runner webview panel.

### 3. Managing Test Cases
- **Add custom test cases**: Use the `+` button in the UI or the `CP Runner: Add Test Case` command.
- **Edit test cases**: Directly click on the input/output text areas in the UI to modify them.
- **Clear test cases**: Use the trash icon to clear individual or all test cases.

---

## ⌨️ Commands & Keybindings

| Command | Description | Default Keybinding |
|---------|-------------|--------------------|
| `cp-runner.runTests` | Run Test Cases for the active file | `Ctrl+Alt+R` / `Cmd+Alt+R` |
| `cp-runner.stopExecution` | Force stop running Test Cases | `Ctrl+Alt+S` / `Cmd+Alt+S` |
| `cp-runner.addTestCase` | Add a new empty Test Case | - |
| `cp-runner.clearTestCases` | Clear All Test Cases | - |

---

## ⚙️ Configuration

CP Runner is highly customizable. You can modify these settings via VS Code settings (`Ctrl+,` -> search for `CP Runner`):

### Execution Settings
- `cp-runner.execution.timeLimit`: Execution time limit per test case in milliseconds. *(Default: `2000`)*
- `cp-runner.execution.memoryLimit`: Memory limit constraints in MB. *(Default: `256`)*
- `cp-runner.concurrency.maxWorkers`: Maximum concurrent execution threads. *(Default: `4`)*
- `cp-runner.execution.autoRun`: Automatically run test cases when the active source file is saved. *(Default: `false`)*
- `cp-runner.execution.autoSave`: Automatically save the active file before running tests. *(Default: `true`)*

### Compiler & Command Settings
- `cp-runner.compiler.cppCommand`: C++ compiler command/path *(Default: `g++`)*
- `cp-runner.compiler.cppFlags`: C++ compiler flags *(Default: `-O2 -std=c++17 -Wshadow`)*
- `cp-runner.compiler.cCommand`: C compiler command/path *(Default: `gcc`)*
- `cp-runner.compiler.cFlags`: C compiler flags *(Default: `-O2 -std=c11`)*
- `cp-runner.compiler.pythonCommand`: Python runtime command *(Default: `python3`)*
- `cp-runner.compiler.javaCommand`: Java runtime command *(Default: `java`)*

### Diff / Output Comparison
- `cp-runner.diff.ignoreTrailingWhitespace`: Ignore trailing whitespace differences. *(Default: `true`)*
- `cp-runner.diff.ignoreSystemLineEndings`: Normalize `\r\n` to `\n`. *(Default: `true`)*
- `cp-runner.diff.floatTolerance`: Enable precision tolerance for float answers. *(Default: `false`)*
- `cp-runner.diff.floatEpsilon`: Epsilon tolerance for float comparison. *(Default: `0.000001`)*

### UI Settings
- `cp-runner.ui.fontSize`: Font size (px) for input/output textareas in the CP Runner panel. *(Default: `12`)*
- `cp-runner.execution.focusOnFileOpen`: Automatically focus the CP Runner panel when you open a file that has test cases assigned to it. *(Default: `true`)*

---

## 🛠️ Development

If you want to contribute to the extension, here's how to run it locally:

1. Clone the repository: `git clone https://github.com/yourusername/cp-runner.git`
2. Run `npm install` to install dependencies.
3. Run `npm run watch` to compile the TypeScript files and Tailwind styles in watch mode.
4. Press `F5` in VS Code to open a new Extension Development Host window.
5. In the new window, open a folder and test out the extension.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
