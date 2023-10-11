## Features

When opening a folder, this extension will look for a file .terminals.json and open the terminals specified.

The json file's root element is an array. This array holds items or arrays of items which will result in split terminals.

```json
[
  [
    {
      "name": "foo"
    },
    {
      "name": "bar"
    }
  ],
  {
    "name": "initial",
    "path": "src",
    "command": "echo 'foo';"
  }
]```

This will open 2 terminal tabs, one will be split in 2 terminals named foo and bar. The second will be named `initial`, cd into the `src` directory and execute `echo 'foo';` there.