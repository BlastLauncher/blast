import * as path from 'path';
import * as webpack from 'webpack';

const configs: webpack.Configuration[] = [
  {
    mode: 'none',
    entry: {
      bundle: path.join(__dirname, './src/index.ts'),
      testClient: path.join(__dirname, './src/testClient.ts'),
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    target: 'node',
    resolve: {
      alias: {
        '@raycast/api': path.join(__dirname, './raycast-api/index.ts'),
      },
      extensions: ['.tsx', '.ts', '.js'],
      fallback: {
        util: false,
        os: false,
        path: false,
        buffer: false,
        assert: false,
        stream: false,
        https: false,
        http: false,
        url: false,
        crypto: false,
        zlib: false,
        fs: false,
      },
    },
  },
];

export default configs;
