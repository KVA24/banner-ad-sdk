const path = require('path');

module.exports = {
  mode: 'production',
  entry: path.resolve(__dirname, 'src', 'ad-sdk.js'),
  
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'ad-sdk.min.js',
    library: { name: 'AdSDK', type: 'umd', export: 'default'},
    globalObject: 'this',
    
    environment: {
      arrowFunction: false,
      const: false,
      destructuring: false,
      forOf: false,
      module: false,
    },
  },
  
  target: ['web', 'es5'],
  
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules\/(core-js|regenerator-runtime)\//,
        use: {
          loader: 'babel-loader',
          options: {
            babelrc: false,
            configFile: false,
            presets: [
              [
                '@babel/preset-env',
                {
                  targets: { chrome: '38', safari: '7', ie: '11' },
                  useBuiltIns: 'usage',
                  corejs: 3,
                  forceAllTransforms: true,
                  modules: 'commonjs',
                },
              ],
            ],
            plugins: [
              '@babel/plugin-transform-class-properties',
              '@babel/plugin-transform-private-methods',
              '@babel/plugin-transform-private-property-in-object',
            ],
          },
        },
      },
    ],
  },
  
  optimization: {
    minimize: true,
  },
  
  devtool: false,
};
