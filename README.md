# TerminalAutomation for VSCode

Automate your development workflow by running specified terminal commands whenever a workspace folder is opened or closed in VS Code.
Perfect for automatically starting development servers and services, cleaning on startup, etc.

## Features

- Automatically opens terminal tabs and runs commands when a workspace folder is opened.
- Supports running multiple commands in split terminal views.
- Allows for different configurations for each folder.
- Supports closing all terminals automatically when a folder is closed.

## How to Use

1. Inside your workspace folder, navigate to `.vscode/` directory.
2. Create a `terminal-automation.jsonc` file if it doesn't already exist.
3. Edit `terminal-automation.jsonc` to configure the extension.

## Configuration File Format

Here's an example `terminal-automation.jsonc`:

```jsonc
{
  "open": [
    [
      {
        "name": "the terminal name",
        "path": "the filesystem path to open",
        "command": "command(s) to run"
      },
      // additional terminal configs for this tab
    ],
    // additional terminal tabs
  ],
  "close": [
    "killall",
    "closeall"
  ]
}
```

### `open`

An array of arrays, representing tabs and the terminals in them. Each tab can contain multiple terminals. Each terminal is defined as an object with the following properties:

- `name`: (string) The name of the terminal tab.
- `command`: (optional string) The command to run in the terminal.
- `path`: (optional string) The directory to open in the terminal.

### `close`

A string or an array of strings, representing the actions to take when the workspace is closed:

- `killall`: Sends a SIGINT (Ctrl+C) to all terminals.
- `closeall`: Closes all terminals.

## Contributing

Feel free to open issues or PRs!
