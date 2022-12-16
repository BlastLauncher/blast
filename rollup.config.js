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
    watch: {
      include: ['./dist/**'],
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
];
