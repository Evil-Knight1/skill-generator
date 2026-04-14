// src/webview.ts
import * as vscode from 'vscode';
import { SkillsGenerator, GenerateOptions } from '../skillsGenerator';

export function showSkillsGeneratorPanel(context: vscode.ExtensionContext) {
    const panel = vscode.window.createWebviewPanel(
        'agentSkillsGenerator',
        'Agent Skills: Skills Generator',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.webview.html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agent Skills</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; }
        .rule-card { transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
    </style>
</head>
<body class="bg-[#1e1e1e] text-white p-6">
    <div class="max-w-3xl mx-auto">
        <div class="flex justify-between items-center mb-8">
            <h1 class="text-2xl font-semibold">Agent Skills: Skills Generator</h1>
            <div class="flex gap-3">
                <button onclick="importSettings()" class="px-6 py-2 bg-[#2d2d2d] hover:bg-[#3d3d3d] rounded-lg text-sm">Import</button>
                <button onclick="exportSettings()" class="px-6 py-2 bg-[#2d2d2d] hover:bg-[#3d3d3d] rounded-lg text-sm">Export</button>
            </div>
        </div>

        <!-- Settings -->
        <div class="mb-8">
            <h2 class="text-lg font-medium mb-4 text-[#cccccc]">Settings</h2>
            <div class="bg-[#252526] rounded-xl p-5 space-y-5">
                <div>
                    <label class="block text-sm text-[#cccccc] mb-1">Output Directory</label>
                    <input id="outputDir" value=".agents/skills" class="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#007acc]">
                </div>

                <div class="flex items-center gap-8">
                    <div class="flex items-center gap-2">
                        <input type="checkbox" id="flatStructure" checked class="w-5 h-5 accent-[#007acc]">
                        <label for="flatStructure" class="text-sm">Flat Structure</label>
                    </div>
                    <div class="flex items-center gap-2">
                        <input type="checkbox" id="crawlDeps" class="w-5 h-5 accent-[#007acc]">
                        <label for="crawlDeps" class="text-sm">Crawl Dependencies (NPM/Pub/Go)</label>
                    </div>
                </div>

                <div>
                    <label class="block text-sm text-[#cccccc] mb-1">Rename File</label>
                    <input id="renameFile" value="SKILL.md" class="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#007acc]">
                </div>
            </div>
        </div>

        <!-- Rules -->
        <div class="mb-8">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-lg font-medium text-[#cccccc]">Rules</h2>
                <button onclick="addRule()" class="flex items-center gap-2 bg-[#007acc] hover:bg-[#1084d0] px-6 py-2 rounded-lg text-sm font-medium">
                    <span class="text-xl leading-none mt-px">+</span> Add Rule
                </button>
            </div>
            <div id="rulesContainer" class="space-y-4"></div>
        </div>

        <!-- Main URL -->
        <div class="bg-[#252526] rounded-xl p-5">
            <label class="block text-sm text-[#cccccc] mb-2">Documentation URL</label>
            <input id="mainUrl" value="https://docs.flutter.dev/" 
                   class="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#007acc]">
        </div>

        <!-- Generate -->
        <button onclick="generateSkills()" 
                class="mt-8 w-full bg-[#00c853] hover:bg-[#00b84a] text-black font-semibold py-4 rounded-2xl text-lg flex items-center justify-center gap-2">
            <span>🚀 Generate Skills</span>
        </button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let ruleId = 1;

        function addRule() {
            const container = document.getElementById('rulesContainer');
            const html = \`
            <div class="rule-card bg-[#252526] rounded-xl p-5 border border-[#3c3c3c]" id="rule-\${ruleId}">
                <div class="flex justify-between mb-4">
                    <span class="text-[#007acc] font-medium">RULE #\${ruleId}</span>
                    <div class="flex gap-1">
                        <button onclick="this.closest('.rule-card').remove()" class="text-red-400 hover:text-red-500 px-3 text-xl">🗑</button>
                    </div>
                </div>
                <div class="space-y-4">
                    <input type="text" placeholder="https://docs.flutter.dev/release/breaki" 
                           class="rule-url w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg px-4 py-2 text-white">
                    <div class="flex items-center gap-8">
                        <div class="flex items-center gap-2">
                            <input type="checkbox" checked class="rule-subpaths w-5 h-5 accent-[#007acc]">
                            <label class="text-sm">Subpaths</label>
                        </div>
                        <select class="rule-action bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg px-4 py-2 text-white">
                            <option value="ignore" selected>Ignore</option>
                            <option value="include">Include</option>
                        </select>
                    </div>
                </div>
            </div>\`;
            container.insertAdjacentHTML('beforeend', html);
            ruleId++;
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
                rules: rules
            };

            vscode.postMessage({ command: 'generate', data });
        }

        function importSettings() { vscode.postMessage({ command: 'import' }); }
        function exportSettings() { vscode.postMessage({ command: 'export' }); }

        // Add one example rule on load
        window.onload = () => {
            setTimeout(addRule, 5000);
        };
    </script>
</body>
</html>`;

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.command === 'generate') {
            const options: GenerateOptions = {
                outputDir: msg.data.outputDir,
                flatStructure: msg.data.flatStructure,
                renameFile: msg.data.renameFile,
                rules: msg.data.rules
            };

            const generator = new SkillsGenerator();

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Generating skills from ${msg.data.url}`,
                cancellable: true
            }, async () => {
                try {
                    const result = await generator.generateFromUrl(msg.data.url, options);
                    vscode.window.showInformationMessage(`✅ Success! ${result.skillName} saved`);
                    panel.dispose();
                } catch (err: any) {
                    vscode.window.showErrorMessage(`❌ ${err.message}`);
                }
            });
        }
    }, undefined, context.subscriptions);
}