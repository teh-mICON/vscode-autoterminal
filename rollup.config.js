import typescript from 'rollup-plugin-typescript2';

export default {
  input: 'src/extension.ts',
  output: {
    file: 'out/main.js',
    format: 'cjs', // commonJS
  },
  external: ['vscode'], // list external dependencies here
  plugins: [
    typescript({
      tsconfig: './tsconfig.json', // your tsconfig file
    }),
  ],
};
