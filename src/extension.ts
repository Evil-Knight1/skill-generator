// src/extension.ts
import * as vscode from 'vscode';
import { SkillsSidebarProvider } from './ui/sidebarView';

export function activate(context: vscode.ExtensionContext) {
	console.log('🚀 Agent Skills extension is now active!');

	const provider = new SkillsSidebarProvider(context);

	// Register the sidebar view
	const viewProvider = vscode.window.registerWebviewViewProvider(
		'agentSkills.sidebar',
		provider,
		{ webviewOptions: { retainContextWhenHidden: true } }
	);
	5 +
		context.subscriptions.push(viewProvider);

	// Command to focus the sidebar
	const focusCommand = vscode.commands.registerCommand('agent-skills.generateFromUrl', () => {
		vscode.commands.executeCommand('agentSkills.sidebar.focus');
	});

	context.subscriptions.push(focusCommand);
}

export function deactivate() { }