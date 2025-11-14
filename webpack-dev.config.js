const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  mode: 'development',
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
  devtool: 'eval-source-map',
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
                targets: { browsers: ['> 0.25%', 'ie 11'] },
                modules: false,
                useBuiltIns: false,
              }]
            ]
          }
        }
      }
    ]
  },
  optimization: {
    minimize: false,
    // minimizer: [
    //   new TerserPlugin({
    //     terserOptions: {
    //       ecma: 5,
    //       compress: {
    //         drop_console: true,
    //         passes: 2
    //       },
    //       mangle: true,
    //       format: {
    //         comments: false
    //       }
    //     },
    //     extractComments: false
    //   })
    // ]
  },
  plugins: []
};
