const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const WebpackObfuscator = require('webpack-obfuscator');

module.exports = {
  mode: 'production',
  entry: path.resolve(__dirname, 'src', 'ad-sdk.js'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'ad-sdk.min.js',
    library: 'AdSDK',
    libraryTarget: 'umd',
    libraryExport: "default",
    globalObject: "typeof self !== 'undefined' ? self : this",
    umdNamedDefine: true
  },
  devtool: false, // **WARNING**: set to false for prod to avoid exposing source maps publicly. Set to 'source-map' only for internal debugging.
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(node_modules)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {ie: '11'},
                useBuiltIns: 'usage',
                corejs: 3,
                modules: false,
                bugfixes: true,
              }]
            ],
            comments: false,
          }
        }
      }
    ]
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          ecma: 5,
          compress: {
            drop_console: true,
            passes: 3,
            pure_getters: true,
          },
          mangle: true,
          format: {
            comments: false
          }
        },
        extractComments: false
      })
    ]
  },
  plugins: [
    new WebpackObfuscator(
      {
        compact: true,
        stringArray: true,
        stringArrayEncoding: ['rc4'],
        stringArrayThreshold: 1,
        rotateStringArray: true,
        identifierNamesGenerator: 'hexadecimal',
        reservedNames: ['AdSDK'],
        reservedStrings: ['AdSDK', 'sdk', 'SDK_INIT', 'window', 'document'],
        seed: 12345
      },
      [] // exclude patterns if needed
    )
  ]
};
