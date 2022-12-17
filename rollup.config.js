import alias from '@rollup/plugin-alias';
import typescript from '@rollup/plugin-typescript';

export default [
  {
    input: './raycast-api/index.ts',
    output: {
      file: './dist/raycast-api.js',
      format: 'es',
    },
    plugins: [typescript()],
  },
  {
    input: './src/index.ts',
    output: {
      file: './dist/bundle.js',
      format: 'es',
    },
    plugins: [
      typescript(),
      alias({
        entries: [
          { find: '@raycast/api', replacement: './dist/raycast-api.js' },
        ],
      }),
    ],
  },
  {
    input: './src/testClient.ts',
    output: {
      file: './dist/testClient.js',
      format: 'es',
    },
    plugins: [typescript()],
  },
];
