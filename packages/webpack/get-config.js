let { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
let PnpWebpackPlugin = require('pnp-webpack-plugin')
let { promisify } = require('util')
let escapeRegexp = require('escape-string-regexp')
let OptimizeCss = require('optimize-css-assets-webpack-plugin')
let { join } = require('path')
let mkdirp = require('mkdirp')
let fs = require('fs')

let writeFile = promisify(fs.writeFile)

const STATIC = /\.(eot|woff2?|ttf|otf|svg|png|jpe?g|gif|webp|mp4|mp3|ogg|pdf|html|ico|md)$/

function checkIfFilesExist(limitConfig, check) {
  let cwd = limitConfig.cwd || process.cwd()

  let filesToCheck = new Set()
  if (check.files) {
    for (let file of check.files) {
      filesToCheck.add(file)
    }
  }
  if (check.path) {
    filesToCheck.add(join(cwd, check.path))
  }


  let filesToIgnore = (check.ignore || []).filter(Boolean).map(file => join(cwd, file))
  filesToCheck = Array.from(filesToCheck).filter(file => !filesToIgnore.includes(file))

  if (filesToIgnore.length && !filesToCheck.length) {
    throw Error(`Could not test '${check.name}' because it includes no file to check`)
  }

  for (let file of filesToCheck) {
    if (!fs.existsSync(file)) {
      throw Error(`Could not test '${check.name}' because file '${file}' is missing`)
    }
  }
}

module.exports = async function getConfig(limitConfig, check, output) {
  checkIfFilesExist(limitConfig, check)

  if (check.import) {
    let loader = ''
    for (let i in check.import) {
      let list = check.import[i].replace(/}|{/g, '').trim()
      loader +=
        `import ${check.import[i]} from ${JSON.stringify(i)}\n` +
        `console.log(${list})\n`
    }
    await mkdirp(output)
    let entry = join(output, 'entry.js')
    await writeFile(entry, loader)
    check.files = entry
  }

  let config = {
    entry: {
      index: check.files
    },
    output: {
      filename: limitConfig.why && `${limitConfig.project}.js`,
      path: output
    },
    optimization: {
      concatenateModules: !check.disableModuleConcatenation
    },
    resolve: {
      plugins: [PnpWebpackPlugin]
    },
    resolveLoader: {
      plugins: [PnpWebpackPlugin.moduleLoader(module)]
    },
    module: {
      rules: [
        {
          test: STATIC,
          use: 'file-loader'
        },
        {
          test: /\.css$/,
          exclude: /\.module\.css$/,
          use: ['style-loader', 'css-loader']
        },
        {
          test: /\.module\.css$/,
          use: [
            'style-loader',
            {
              loader: 'css-loader',
              options: {
                modules: true
              }
            }
          ]
        }
      ]
    },
    plugins: [new OptimizeCss()]
  }

  if (check.ignore && check.ignore.length > 0) {
    let escaped = check.ignore.map(i => escapeRegexp(i))
    let ignorePattern = new RegExp(`^(${escaped.join('|')})($|/)`)
    config.externals = (context, request, callback) => {
      if (ignorePattern.test(request)) {
        callback(null, 'root a')
      } else {
        callback()
      }
    }
  }

  if (limitConfig.why) {
    config.plugins.push(
      new BundleAnalyzerPlugin({
        openAnalyzer: process.env.NODE_ENV !== 'test',
        analyzerMode: process.env.NODE_ENV === 'test' ? 'static' : 'server',
        defaultSizes: check.gzip === false ? 'parsed' : 'gzip',
        analyzerPort: 8888 + limitConfig.checks.findIndex(i => i === check)
      })
    )
  } else if (limitConfig.saveBundle) {
    config.plugins.push(
      new BundleAnalyzerPlugin({
        openAnalyzer: false,
        analyzerMode: 'disabled',
        generateStatsFile: true
      })
    )
  }

  return config
}
