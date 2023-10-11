import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';

class TECHTILE_VSCODE_TerminalAutomation {

	private workspaceFolders: ReadonlyArray<vscode.WorkspaceFolder> = [];

	private static _instance: TECHTILE_VSCODE_TerminalAutomation;
	public static instance(): TECHTILE_VSCODE_TerminalAutomation {
		return TECHTILE_VSCODE_TerminalAutomation._instance || (TECHTILE_VSCODE_TerminalAutomation._instance = new TECHTILE_VSCODE_TerminalAutomation());
	}

	public activate(context: vscode.ExtensionContext) {
		// remove existing terminals
		if (vscode.window.terminals.length)
			vscode.window.terminals.forEach(terminal => {
				this.sendSIGINT(terminal);
				terminal.dispose();
			});


		// set initial state
		this.workspaceFolders = vscode.workspace.workspaceFolders || [];

		// listen for changes on workspace folders
		console.info('TerminalAutomation: activating workspace folder change listener');
		context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders((e) => {
			const currentWorkspaceFolders = vscode.workspace.workspaceFolders || [];

			// check for folder open
			for (const folder of currentWorkspaceFolders) {
				if (!this.workspaceFolders.find(f => f.uri.toString() === folder.uri.toString())) {
					console.log(`TerminalAutomation: folder opened: ${folder.name}`);
					this.open(folder);
				}
			}

			// check for folder close
			for (const folder of this.workspaceFolders) {
				if (!currentWorkspaceFolders.find(f => f.uri.toString() === folder.uri.toString())) {
					console.log(`TerminalAutomation: folder closed: ${folder.name}`);
					this.close(folder);
				}
			}

			// update folder state
			this.workspaceFolders = currentWorkspaceFolders;
		}));

		// open initially
		this.workspaceFolders.forEach(folder => {
			this.open(folder);
		});
	}

	private async open(folder: vscode.WorkspaceFolder) {
		const config = await this.getConfig(folder);
		if (config === null)
			return;


		if (!config.open)
			return;

		// create terminals according to config file
		console.log(`Running TerminalAutomation open config for ${folder.name}`);
		config.open.forEach((tabData: any) => {
			if (!Array.isArray(tabData)) {
				this.openTerminal(tabData);
			} else {
				const mainTerminal = this.openTerminal(tabData[0]);
				tabData.slice(1).forEach((splitData: any) => {
					this.openTerminal(splitData, mainTerminal);
				});
			}
		});
	}

	private async close(folder: vscode.WorkspaceFolder) {
		const config = await this.getConfig(folder);
		if (config === null)
			return;

		if (!config.close)
			return;

		if (typeof config.close === 'string') {
			this.executeMacro(config.close);
		} else if (Array.isArray(config.close)) {
			config.close.forEach((macro: string) => {
				this.executeMacro(macro);
			});
		}
	}

	private async executeMacro(macro: string) {
		switch (macro) {
			case 'killall':
				vscode.window.terminals.forEach(terminal => {
					this.sendSIGINT(terminal);
				});
				break;
			case 'closeall':
				vscode.window.terminals.forEach(terminal => {
					terminal.dispose();
				});
				break;
			default:
				console.error("TerminalAutomation: Unknown macro", macro);
		}
	}

	private openTerminal(data: { name: string, command?: string, path?: string, location?: { parentTerminal: any } }, parent: vscode.Terminal | null = null): vscode.Terminal {
		console.log(`Opening terminal (parent: ${parent ? '"' + parent.name + '"' : 'none'}) ${JSON.stringify(data)}`);
		try {
			let terminal;
			if (!parent)
				terminal = vscode.window.createTerminal({ name: data.name });
			else
				terminal = vscode.window.createTerminal({ name: data.name, location: { parentTerminal: parent } });


			if (data.path)
				terminal.sendText(`cd ${data.path}; clear;`);
			terminal.show();
			if (data.command)
				terminal.sendText(data.command);
			return terminal;
		} catch (error) {
			console.error("TerminalAutomation error on creating terminal", data, parent, error);
		}
	}

	private async getConfig(folder: vscode.WorkspaceFolder) {
		const uri = vscode.Uri.joinPath(folder.uri, '.vscode/.terminal-automation.jsonc');

		// abort if no workspace open
		if (vscode.workspace.workspaceFolders === undefined)
			return null;


		// await if workspace has no auto terminal config file
		try {
			await vscode.workspace.fs.stat(uri);
		} catch (error) {
			console.info("Skipping TerminalAutomation workspace folder without config file", folder.name);
			return null;
		}

		// read config file, abort on error
		let fileContent: string;
		try {
			const fileContentUint8Array = await vscode.workspace.fs.readFile(uri);
			fileContent = new TextDecoder().decode(fileContentUint8Array);
		} catch (error) {
			console.error("Error reading TerminalAutomation workspace config file", error);
			return null;
		}

		// parse config file, abort on error
		let parsed;
		try {
			parsed = jsonc.parse(fileContent);
		} catch (error) {
			console.error("Error parsing TerminalAutomation workspace config file", error);
			return;
		}
		return parsed;
	}

	private sendSIGINT(terminal: vscode.Terminal) {
		terminal.sendText('\x03');
	}

	public async deactivate(context: vscode.ExtensionContext) {
		this.workspaceFolders.forEach(folder => {
			this.close(folder);
		});
	}
}

export function activate(context: vscode.ExtensionContext) {
	TECHTILE_VSCODE_TerminalAutomation.instance().activate(context);
}
export function deactivate(context: vscode.ExtensionContext) {
	TECHTILE_VSCODE_TerminalAutomation.instance().deactivate(context);
}
