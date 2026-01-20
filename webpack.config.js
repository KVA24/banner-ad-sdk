const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

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
  devtool: false,
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
                targets: {
                  browsers: ['chrome 38', 'ie 11']
                },
                useBuiltIns: 'usage',
                corejs: 3,
                modules: false,
                bugfixes: true,
                // Debug: log transformations
                debug: false
              }]
            ],
            plugins: [
              ['@babel/plugin-transform-runtime', {
                corejs: false,
                helpers: true,
                regenerator: true,
                useESModules: false
              }],
              '@babel/plugin-proposal-optional-chaining',
              '@babel/plugin-proposal-nullish-coalescing-operator',
              '@babel/plugin-proposal-object-rest-spread'
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
            passes: 2,
            // Safe compression settings
            arrows: false,
            collapse_vars: false,
            comparisons: true,
            computed_props: false,
            hoist_funs: false,
            hoist_props: false,
            hoist_vars: false,
            inline: false,
            loops: false,
            negate_iife: false,
            properties: false,
            reduce_funcs: false,
            reduce_vars: false,
            switches: false,
            toplevel: false,
            typeofs: false,
            booleans: true,
            if_return: true,
            sequences: true,
            unused: true,
            conditionals: true,
            dead_code: true,
            evaluate: true,
            join_vars: true,
            keep_fnames: false,
            pure_getters: true
          },
          mangle: {
            reserved: ['AdSDK'],
            keep_classnames: true,
            keep_fnames: false
          },
          format: {
            comments: false,
            ecma: 5,
            ascii_only: true,
            beautify: false
          },
          ie8: true,
          safari10: true
        },
        extractComments: false
      })
    ]
  },
  plugins: [
    // NO OBFUSCATION - để test trước
  ],
  resolve: {
    extensions: ['.js']
  },
  // Performance hints
  performance: {
    hints: 'warning',
    maxEntrypointSize: 512000,
    maxAssetSize: 512000
  }
};