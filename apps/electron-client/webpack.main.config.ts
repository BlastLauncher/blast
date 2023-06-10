import path from 'path'

import CopyWebpackPlugin from 'copy-webpack-plugin';
import type { Configuration } from 'webpack';
import { DefinePlugin } from 'webpack';

import { rules } from './webpack.rules';
const modulePath = path.resolve(__dirname, "blast_runtime/utility_process");

export const mainConfig: Configuration = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/index.ts',
  // Put your normal webpack config below here
  module: {
    rules,
  },
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'assets',
          to: 'assets',
        },
      ],
    }),
    new DefinePlugin({
      UTILITY_PROCESS_MODULE_PATH: JSON.stringify(modulePath),
    }),
  ],
};
