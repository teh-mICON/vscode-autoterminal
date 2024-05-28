import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import * as path from 'path';
import * as _ from 'lodash';

interface TECHTILE_VSCODE_TerminalAutomation_Config {
	open?: TECHTILE_VSCODE_TerminalAutomation_Config_Open | TECHTILE_VSCODE_TerminalAutomation_Config_Open[],
	close: "killall" | "closeall" | ["killall" | "closeall"]
}

interface TECHTILE_VSCODE_TerminalAutomation_Config_Open {
	name: string,
	path?: string,
	command?: string,
}

class TECHTILE_VSCODE_TerminalAutomation {
	private static TERMINAL_STATE_KEY = 'vscode-terminal-automation.terminals';

	private context: vscode.ExtensionContext;

	private workspaceFolders: ReadonlyArray<vscode.WorkspaceFolder> = [];
	private terminalMap: { [key: string]: number };

	private folderConfigurations: { [key: string]: TECHTILE_VSCODE_TerminalAutomation_Config } = {};


	private updateWorkspaceState() {
		this.context.workspaceState.update(TECHTILE_VSCODE_TerminalAutomation.TERMINAL_STATE_KEY, this.terminalMap);
		console.log('TerminalAutomation: updated terminal map in workspaceState: ', this.terminalMap);

	}
	private static _instance: TECHTILE_VSCODE_TerminalAutomation;
	public static instance(): TECHTILE_VSCODE_TerminalAutomation {
		return TECHTILE_VSCODE_TerminalAutomation._instance || (TECHTILE_VSCODE_TerminalAutomation._instance = new TECHTILE_VSCODE_TerminalAutomation());
	}

	public async activate(context: vscode.ExtensionContext) {
		this.context = context;
		// this.terminalMap = {};
		// this.updateWorkspaceState();

		// set initial state
		this.workspaceFolders = vscode.workspace.workspaceFolders || [];
		console.log('TerminalAutomation: workspace folders', this.workspaceFolders.map(folder => folder.name));

		// load terminal map from workspace state
		this.terminalMap = this.context.workspaceState.get(TECHTILE_VSCODE_TerminalAutomation.TERMINAL_STATE_KEY) || {};
		console.log('TerminalAutomation: workspaceState terminal map', this.context.workspaceState.get(TECHTILE_VSCODE_TerminalAutomation.TERMINAL_STATE_KEY));
		console.log('TerminalAutomation: initial terminal map', this.terminalMap);

		// get all terminal PIDs
		const terminalIds = await this.getTerminalIds();

		// delete terminals from map that are not open anymore
		_.each(this.terminalMap, (pid, key) => {
			if (!terminalIds.includes(pid)) {
				console.log(`TerminalAutomation: removing closed terminal ${key} with PID ${pid} from map`);
				delete this.terminalMap[key];
			}
		});

		// open workspace folders initially
		for (const folder of this.workspaceFolders) {
			console.log(`TerminalAutomation: open workspace folder ${folder.name}`)
			await this.open(folder, context);
		}

		// Listen for terminal close events to update the map
		vscode.window.onDidCloseTerminal(async (terminal) => {
			const pid = await terminal.processId;
			console.log(`TerminalAutomation: terminal closed with pid ${pid}`);
			const index = _.findKey(this.terminalMap, (value) => value === pid);
			delete this.terminalMap[index];
			this.updateWorkspaceState();
		});

		// Watch for workspace folder changes
		vscode.workspace.onDidChangeWorkspaceFolders((event) => {
			// Get the added and removed workspace folders
			const addedFolders = event.added;
			const removedFolders = event.removed;

			// Handle added folders
			addedFolders.forEach((folder) => {
				console.log(`TerminalAutomation: workspace folder added - ${folder.name}`);
				this.open(folder, this.context);
			});

			// Handle removed folders
			removedFolders.forEach((folder) => {
				console.log(`TerminalAutomation: workspace folder removed - ${folder.name}`);
				this.close(folder, this.context);
			});
		});

	}

	private async getTerminalIds() {
		return await Promise.all(_.map(vscode.window.terminals, async (terminal) => {
			return await terminal.processId;
		}));
	}

	private async open(folder: vscode.WorkspaceFolder, context: vscode.ExtensionContext) {
		const config = await this.getConfig(folder);
		if (config === null) {
			console.log(`TerminalAutomation: config for folder ${folder.name} is null`)
			return;
		}

		if (!config.open) {
			console.log('TerminalAutomation: no open config for folder: ', folder.name)
			return;
		}

		// Create terminals according to config file
		console.log(`TerminalAutomation: opening terminals for folder ${folder.name}`);
		for (const open of config.open) {
			if (Array.isArray(open)) {
				console.log(`TerminalAutomation: opening main terminal for folder ${folder.name}`);
				const mainTerminal = await this.openTerminal(open[0], folder, 0);
				console.log(`TerminalAutomation: main terminal is open and promise resolved`)
				for (let i = 1; i < open.length; i++) {
					console.log(`TerminalAutomation: opening split terminal ${i} for folder ${folder.name}`);
					await this.openTerminal(open[i], folder, i, mainTerminal);
					console.log(`TerminalAutomation: split terminal ${i} is open and promise resolved`)
				}
			} else {
				console.log(`TerminalAutomation: opening single terminal for folder ${folder.name}`);
				await this.openTerminal(open, folder, 0);
			}
		}
	}

	private async close(folder: vscode.WorkspaceFolder, context: vscode.ExtensionContext) {
		console.log(`TerminalAutomation: running close on workspace folder ${folder.name}`)
		const config = await this.getConfig(folder);
		if (config === null) {
			console.log(`TerminalAutomation: config for folder ${folder.name} is null`)
			return;
		}

		if (!config.close) {
			console.log(`TerminalAutomation: no close configuration for folder ${folder.name}`)
			return;
		}

		const runActionOnTerminals = async (name: string, action: Function) => {
			const actionTerminals = _.filter(this.terminalMap, (pid, terminalId) => terminalId.startsWith(folder.uri.fsPath));
			if (!actionTerminals.length) {
				console.log(`TerminalAutomation: no terminals to action (${name}) for folder ${folder.name}`);
				return;
			}
			const terminalIdsRunning = await this.getTerminalIds();
			_.each(actionTerminals, (pid, terminalId) => {
				if (!terminalIdsRunning.includes(pid))
					return;
				console.log(`TerminalAutomation: running action ${name} on terminal ${terminalId} with PID ${pid}`);
				const terminal = vscode.window.terminals.find(terminal => terminal.processId === pid);
				if (!terminal)
					return

				console.log(`TerminalAutomation: running action ${name} on terminal ${terminalId} with PID ${pid}`);
				action(terminal);
			})
		}

		if (config.close === 'killall') {
			await runActionOnTerminals(config.close, this.sendSIGINT);
		} else if (config.close === 'closeall') {
			await runActionOnTerminals(config.close, (terminal: vscode.Terminal) => terminal.dispose());
		} else if (Array.isArray(config.close)) {
			if (config.close.includes('killall'))
				await runActionOnTerminals('killall', this.sendSIGINT);
			if (config.close.includes('closeall'))
				await runActionOnTerminals('closeall', (terminal: vscode.Terminal) => terminal.dispose());
		}
	}

	private openTerminal(data: TECHTILE_VSCODE_TerminalAutomation_Config_Open, folder: vscode.WorkspaceFolder, identifier: string | number, parent: vscode.Terminal | null = null): Promise<vscode.Terminal | null> {
		const terminalId = `${folder.uri.fsPath}-${identifier}`;

		// Check if a terminal with this ID already exists
		if (Object.keys(this.terminalMap).includes(terminalId)) {
			console.log(`TerminalAutomation: terminal already open with id ${terminalId}`);
			return null;
		}

		console.log(`TerminalAutomation: Opening terminal (parent: ${parent ? '"' + parent.name + '"' : 'none'}) ${JSON.stringify(data)} with id ${terminalId}`);



		// let terminal;
		// if (!parent)
		// 	terminal = vscode.window.createTerminal({ name: data.name });
		// else
		// 	terminal = vscode.window.createTerminal({ name: data.name, location: { parentTerminal: parent } });





		try {
			let terminal;
			if (!parent) {
				console.log(`TerminalAutomation: ACTUAL: creating terminal no parent: ${data.name}`);
				terminal = vscode.window.createTerminal({ name: data.name });
			}
			else {
				console.log(`TerminalAutomation: ACTUAL: creating terminal WITH parent: ${parent.name} -> ${data.name}`);
				terminal = vscode.window.createTerminal({ name: data.name, location: { parentTerminal: parent } });
			}

			console.log(`TerminalAutomation: created terminal ${data.name} with id ${terminalId}. Waiting for PID.`);
			terminal.processId.then(pid => {
				this.terminalMap[terminalId] = pid;
				this.updateWorkspaceState();
				console.log(`TerminalAutomation: terminal ${data.name} with id ${terminalId} has PID ${pid}. Added to terminal map.`);
			})

			if (data.path)
				terminal.sendText(`cd ${data.path}; clear;`);
			terminal.show();
			if (data.command)
				terminal.sendText(data.command);

			return terminal;
		} catch (error) {
			console.error("TerminalAutomation error on creating terminal", data, parent, error);
			return null;
		}
	}

	private async getConfig(folder: vscode.WorkspaceFolder) {
		// Check if we already have a configuration for this folder
		if (this.folderConfigurations[folder.uri.fsPath]) {
			console.log(`TerminalAutomation: returning cached config for folder ${folder.name}`);
			return this.folderConfigurations[folder.uri.fsPath];
		}

		// keep .jsonc for backwards compatibility
		const configFiles = ['terminal-automation.jsonc', 'terminal-automation.json'];
		let fileContent: string | null = null;

		for (const configFile of configFiles) {
			const filePath = path.join(folder.uri.fsPath, '.vscode', configFile);
			const uri = vscode.Uri.file(filePath);

			try {
				// console.log(`TerminalAutomation: running stat on ${uri}`)
				await vscode.workspace.fs.stat(uri);
				const fileContentUint8Array = await vscode.workspace.fs.readFile(uri);
				fileContent = new TextDecoder().decode(fileContentUint8Array);
				// console.log(`TerminalAutomation: successfully read config from ${uri}`)
				break; // if we successfully read a file, we can stop looking
			} catch (error) {
				// console.log(`TerminalAutomation: failed stat or read on ${uri}`)
				// File doesn't exist, try the next one
				continue;
			}
		}

		if (!fileContent) {
			return null;
		}

		// Parse config file, abort on error
		let parsed;
		try {
			parsed = jsonc.parse(fileContent);
		} catch (error) {
			console.error("Error parsing TerminalAutomation workspace config file", error);
			return null;
		}

		console.log(`TerminalAutomation: Parsed config file for folder ${folder.name}`);

		this.folderConfigurations[folder.uri.fsPath] = parsed;
		return parsed;
	}

	private sendSIGINT(terminal: vscode.Terminal) {
		terminal.sendText('\x03');
	}

	public async deactivate(context: vscode.ExtensionContext) {
		this.workspaceFolders.forEach(folder => {
			this.close(folder, context);
		});
	}
}

export function activate(context: vscode.ExtensionContext) {
	TECHTILE_VSCODE_TerminalAutomation.instance().activate(context);
}

export function deactivate(context: vscode.ExtensionContext) {
	TECHTILE_VSCODE_TerminalAutomation.instance().deactivate(context);
}
