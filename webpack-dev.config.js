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
                // Target cụ thể cho WebOS TV cũ
                targets: {
                  browsers: ['chrome 38', 'ie 11']
                },
                // BẮT BUỘC: useBuiltIns để polyfill
                useBuiltIns: 'usage',
                corejs: 3,
                // BẮT BUỘC: modules false cho tree-shaking
                modules: false
              }]
            ],
            plugins: [
              // Transform async/await thành Promise
              '@babel/plugin-transform-runtime',
              // Transform optional chaining
              '@babel/plugin-proposal-optional-chaining',
              // Transform nullish coalescing
              '@babel/plugin-proposal-nullish-coalescing-operator',
              // Transform object spread
              '@babel/plugin-proposal-object-rest-spread'
            ]
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
          // ECMAScript 5 cho tương thích tối đa
          ecma: 5,
          compress: {
            // Không drop console trong dev
            drop_console: false,
            passes: 2,
            // Giữ lại function names để debug
            keep_fnames: true
          },
          mangle: {
            // Không mangle trong dev để debug dễ hơn
            keep_fnames: true
          },
          format: {
            comments: false
          }
        },
        extractComments: false
      })
    ]
  },
  plugins: [],
  // Thêm resolve cho alias nếu cần
  resolve: {
    extensions: ['.js'],
    alias: {
      // Nếu có sử dụng path alias
    }
  }
};