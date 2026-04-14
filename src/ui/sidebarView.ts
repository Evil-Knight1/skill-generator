// src/ui/sidebarView.ts
import * as vscode from 'vscode';
import { SkillsGenerator, GenerateOptions } from '../skillsGenerator';

export class SkillsSidebarProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private currentCancellationTokenSource?: vscode.CancellationTokenSource;

    constructor(private readonly context: vscode.ExtensionContext) { }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };

        webviewView.webview.html = this.getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            if (msg.command === 'generate') {
                const options: GenerateOptions = {
                    outputDir: msg.data.outputDir,
                    flatStructure: msg.data.flatStructure,
                    crawlDependencies: msg.data.crawlDependencies,
                    renameFile: msg.data.renameFile,
                    scope: msg.data.scope || 'project',
                    rules: msg.data.rules
                };

                const generator = new SkillsGenerator();
                
                if (this.currentCancellationTokenSource) {
                    this.currentCancellationTokenSource.cancel();
                }
                this.currentCancellationTokenSource = new vscode.CancellationTokenSource();

                // Send a message back to the webview to start progress
                this._view?.webview.postMessage({ type: 'progress', message: 'Starting process...' });

                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `🔄 Crawling ${msg.data.url}...`,
                    cancellable: true
                }, async (progress, token) => {
                    // Link VS Code notification cancel token with our own cancel token source
                    token.onCancellationRequested(() => {
                        this.currentCancellationTokenSource?.cancel();
                    });

                    try {
                        const result = await generator.generateFromUrl(
                            msg.data.url, 
                            options, 
                            (progressMsg) => {
                                // Update progress inside the webview
                                this._view?.webview.postMessage({ type: 'progress', message: progressMsg });
                            },
                            this.currentCancellationTokenSource!.token
                        );
                        
                        const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        this._view?.webview.postMessage({ type: 'completed', time: timeString });
                        
                        vscode.window.showInformationMessage(`✅ Skills generated/updated successfully!`);
                    } catch (err: any) {
                        this._view?.webview.postMessage({ type: 'error', message: err.message });
                        if (err.message !== 'Cancelled') {
                            vscode.window.showErrorMessage(`❌ ${err.message}`);
                        } else {
                            vscode.window.showInformationMessage('🛑 Crawling stopped manually.');
                        }
                    } finally {
                        this.currentCancellationTokenSource?.dispose();
                        this.currentCancellationTokenSource = undefined;
                    }
                });
            } else if (msg.command === 'cancel') {
                if (this.currentCancellationTokenSource) {
                    this.currentCancellationTokenSource.cancel();
                }
            } else if (msg.command === 'import') {
                vscode.window.showInformationMessage('Import feature not yet implemented.');
            } else if (msg.command === 'export') {
                vscode.window.showInformationMessage('Export feature not yet implemented.');
            }
        });
    }

    private getHtml(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agent Skills Settings</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; background-color: #1e1e1e; color: #fff; padding: 16px; margin: 0; }
        .rule-card { transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
        input[type="text"], input[type="url"], select {
            background-color: #3b3b3b;
            color: white;
            border: 1px solid #555;
        }
        input[type="text"]:focus, input[type="url"]:focus, select:focus {
            outline: none;
            border-color: #007acc;
        }
    </style>
</head>
<body>
    <div class="max-w-full">
        <h1 class="text-xl font-bold mb-4 border-b border-[#3c3c3c] pb-2 flex justify-between items-center">
            <span>🛠 Agent Skills</span>
        </h1>

        <!-- Documentation URL -->
        <div class="mb-5">
            <label class="block text-sm font-semibold mb-1 text-[#cccccc]">Documentation URL</label>
            <input id="mainUrl" type="url" value="https://docs.flutter.dev/" class="w-full rounded px-3 py-2 text-sm" placeholder="https://...">
        </div>

        <!-- Settings -->
        <div class="mb-5 bg-[#252526] rounded border border-[#3c3c3c] p-3 shadow-sm">
            <div class="flex justify-between items-center mb-3">
                <h2 class="text-sm font-semibold text-[#cccccc]">Settings</h2>
                <div class="flex gap-2">
                    <button onclick="importSettings()" title="Import" class="text-xs bg-[#3b3b3b] hover:bg-[#505050] text-[#cccccc] px-2 py-1 rounded">📥</button>
                    <button onclick="exportSettings()" title="Export" class="text-xs bg-[#3b3b3b] hover:bg-[#505050] text-[#cccccc] px-2 py-1 rounded">📤</button>
                </div>
            </div>
            
            <div class="mb-4">
                <label class="block text-xs font-medium text-[#cccccc] mb-2 uppercase tracking-tight">Target Scope</label>
                <div class="flex bg-[#1e1e1e] rounded p-1 border border-[#3c3c3c]">
                    <button onclick="setScope('project')" id="scopeProject" class="flex-1 py-1 text-[10px] font-bold rounded bg-[#007acc] text-white">PROJECT</button>
                    <button onclick="setScope('global')" id="scopeGlobal" class="flex-1 py-1 text-[10px] font-bold rounded text-gray-400 hover:text-white">GLOBAL</button>
                </div>
                <div id="scopeInfo" class="mt-1.5 text-[9px] text-gray-500 italic px-1">Saving to: Current Workspace</div>
            </div>

            <div class="space-y-3 mt-2">
                <div id="dirContainer">
                    <label class="block text-xs font-medium text-[#cccccc] mb-1">Output Directory</label>
                    <input id="outputDir" type="text" value=".agents/skills" class="w-full rounded px-2 py-1.5 text-xs">
                </div>
                <div>
                    <label class="block text-xs font-medium text-[#cccccc] mb-1">Rename File</label>
                    <input id="renameFile" type="text" value="SKILL.md" class="w-full rounded px-2 py-1.5 text-xs">
                </div>
                <div class="pt-2 border-t border-[#3c3c3c] flex flex-col gap-2">
                    <div class="flex items-center gap-2">
                        <input type="checkbox" id="flatStructure" checked class="w-4 h-4 accent-[#007acc]">
                        <label for="flatStructure" class="text-xs">Flat Structure (One folder per topic)</label>
                    </div>
                    <div class="flex items-center gap-2">
                        <input type="checkbox" id="crawlDeps" class="w-4 h-4 accent-[#007acc]">
                        <label for="crawlDeps" class="text-xs text-blue-200">Crawl Dependencies (NPM/Pub/Go)</label>
                    </div>
                </div>
            </div>
        </div>

        <!-- Rules -->
        <div class="mb-5">
            <div class="flex justify-between items-center mb-2">
                <h2 class="text-sm font-semibold text-[#cccccc]">Rules</h2>
                <button onclick="addRule()" class="flex items-center gap-1 bg-[#007acc] hover:bg-[#1084d0] text-white text-xs px-2 py-1 rounded">
                    + Add
                </button>
            </div>
            <div id="rulesContainer" class="space-y-2"></div>
        </div>

        <!-- Generate Button -->
        <button onclick="generateSkills()" 
                id="generateBtn"
                class="w-full bg-[#00c853] hover:bg-[#00b84a] text-black font-semibold py-2.5 rounded shadow-lg flex items-center justify-center gap-2 text-sm transition-colors">
            ⚡ Generate Skills
        </button>

        <!-- Progress Status -->
        <div id="progressContainer" class="mt-4 hidden">
            <div class="flex justify-between items-end mb-1">
                <div class="text-xs text-[#007acc] font-medium" id="progressText">Starting...</div>
                <button onclick="stopCrawl()" id="stopBtn" class="bg-[#d32f2f] hover:bg-[#b71c1c] text-white text-[10px] px-2 py-1 rounded shadow cursor-pointer transition-colors">
                    🛑 Stop
                </button>
            </div>
            <div class="w-full bg-[#3c3c3c] rounded-full h-1.5 animate-pulse">
                <div class="bg-[#007acc] h-1.5 rounded-full" style="width: 100%"></div>
            </div>
        </div>

        <!-- Last Checked -->
        <div class="mt-4 text-center">
            <span id="lastChecked" class="text-[10px] text-gray-500 italic">Last updated: Never</span>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let ruleId = 1;
        let currentScope = 'project';

        function setScope(scope) {
            currentScope = scope;
            const projectBtn = document.getElementById('scopeProject');
            const globalBtn = document.getElementById('scopeGlobal');
            const info = document.getElementById('scopeInfo');
            const dirContainer = document.getElementById('dirContainer');

            if (scope === 'project') {
                projectBtn.classList.add('bg-[#007acc]', 'text-white');
                projectBtn.classList.remove('text-gray-400', 'hover:text-white');
                globalBtn.classList.remove('bg-[#007acc]', 'text-white');
                globalBtn.classList.add('text-gray-400', 'hover:text-white');
                info.innerText = 'Saving to: Current Workspace';
                dirContainer.classList.remove('opacity-50', 'pointer-events-none');
            } else {
                globalBtn.classList.add('bg-[#007acc]', 'text-white');
                globalBtn.classList.remove('text-gray-400', 'hover:text-white');
                projectBtn.classList.remove('bg-[#007acc]', 'text-white');
                projectBtn.classList.add('text-gray-400', 'hover:text-white');
                info.innerText = 'Saving to: ~/.gemini/antigravity/skills/';
                // Disable output dir for global as it's fixed
                dirContainer.classList.add('opacity-50', 'pointer-events-none');
            }
        }

        function addRule() {
            const container = document.getElementById('rulesContainer');
            const html = \`
            <div class="rule-card bg-[#252526] rounded border border-[#3c3c3c] p-2 flex flex-col gap-2" id="rule-\${ruleId}">
                <div class="flex justify-between items-center">
                    <span class="text-[#007acc] text-[10px] font-bold tracking-wider">RULE #\${ruleId}</span>
                    <div class="flex gap-1">
                        <button onclick="moveUp(this)" class="text-gray-400 hover:text-white px-1">⬆️</button>
                        <button onclick="moveDown(this)" class="text-gray-400 hover:text-white px-1">⬇️</button>
                        <button onclick="this.closest('.rule-card').remove()" class="text-red-400 hover:text-red-500 px-1 ml-1">🗑</button>
                    </div>
                </div>
                <input type="text" placeholder="e.g. /release/breaki" class="rule-url w-full rounded px-2 py-1 text-xs">
                <div class="flex items-center justify-between mt-1">
                    <div class="flex items-center gap-1.5">
                        <input type="checkbox" checked class="rule-subpaths w-3 h-3 accent-[#007acc]">
                        <label class="text-[10px]">Subpaths</label>
                    </div>
                    <select class="rule-action rounded px-2 py-1 text-[10px]">
                        <option value="ignore" selected>Ignore</option>
                        <option value="include">Include</option>
                    </select>
                </div>
            </div>\`;
            container.insertAdjacentHTML('beforeend', html);
            ruleId++;
        }

        function moveUp(btn) {
            const card = btn.closest('.rule-card');
            if (card.previousElementSibling) card.parentNode.insertBefore(card, card.previousElementSibling);
        }

        function moveDown(btn) {
            const card = btn.closest('.rule-card');
            if (card.nextElementSibling) card.parentNode.insertBefore(card.nextElementSibling, card);
        }

        function generateSkills() {
            const rules = Array.from(document.querySelectorAll('.rule-card')).map(card => ({
                urlPattern: card.querySelector('.rule-url').value.trim(),
                subpaths: card.querySelector('.rule-subpaths').checked,
                action: card.querySelector('.rule-action').value
            })).filter(r => r.urlPattern);

            const data = {
                url: document.getElementById('mainUrl').value.trim(),
                outputDir: document.getElementById('outputDir').value,
                flatStructure: document.getElementById('flatStructure').checked,
                crawlDependencies: document.getElementById('crawlDeps').checked,
                renameFile: document.getElementById('renameFile').value,
                scope: currentScope,
                rules: rules
            };

            // UI feedback
            document.getElementById('generateBtn').innerText = '⏳ Generating...';
            document.getElementById('generateBtn').classList.add('opacity-50', 'cursor-not-allowed');
            document.getElementById('progressContainer').classList.remove('hidden');
            document.getElementById('progressText').innerText = "Starting engine...";

            vscode.postMessage({ command: 'generate', data });
        }

        function stopCrawl() {
            document.getElementById('progressText').innerText = "Stopping globally...";
            vscode.postMessage({ command: 'cancel' });
        }

        function importSettings() { vscode.postMessage({ command: 'import' }); }
        function exportSettings() { vscode.postMessage({ command: 'export' }); }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'progress') {
                document.getElementById('progressText').innerText = message.message;
            } else if (message.type === 'completed' || message.type === 'error') {
                document.getElementById('generateBtn').innerText = '⚡ Generate Skills';
                document.getElementById('generateBtn').classList.remove('opacity-50', 'cursor-not-allowed');
                document.getElementById('progressContainer').classList.add('hidden');
                
                if (message.type === 'completed') {
                    document.getElementById('lastChecked').innerText = \`Last updated: Today at \${message.time}\`;
                }
            }
        });

        // Add one example rule automatically
        window.onload = () => setTimeout(addRule, 200);
    </script>
</body>
</html>`;
    }
}