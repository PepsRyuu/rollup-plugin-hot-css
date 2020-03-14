let fs = require('fs');
let path = require('path');
let csstree = require('css-tree');
let SourceMap = require('source-map');

function getHotModuleCode () {
    return `
        module && module.hot && module.hot.dispose(window.__css_reload);
        module && module.hot && module.hot.accept(window.__css_reload);
    `;  
}

function extractFilepathFromNode (node) {
    let v = node.value.value.replace(/"|'/g, '').split('?')[0];
    if (v.indexOf('data:') === -1) {
        return v;
    }
}

function createLoaderPipeline (options, assets) {
    let pipeline = [];

    options.loaders.forEach(loader => {
        if (loader === 'scss') {
            pipeline.push((input, id) => {
                let transpiled = require('node-sass').renderSync({
                    data: input.code,
                    file: id,
                    outFile: id,
                    sourceMap: true,
                    includePaths: [ path.dirname(id) ]
                });

                return { 
                    code: transpiled.css.toString(),
                    map: transpiled.map.toString()
                };
            });
        }

        if (loader === 'less') {
            pipeline.push((input, id) => {
                let code, map;
                let transpiled = require('less').render(input.code, {
                    async: false,
                    filename: id,
                    syncImport: true,
                    sourceMap: {
                        sourceMapRootpath: path.dirname(id),
                        sourceMapBasepath: path.dirname(id)
                    },
                }, function (err, input) {
                    if (err) {
                        console.error(err);
                    }

                    code = input.css;
                    map = input.map;
                });

                return { 
                    code, 
                    map
                };
            });
        }

        if (typeof loader === 'function') {
            pipeline.push(loader);
        }
    });

    if (options.url) {
        pipeline.push((input, id) => {
            let ast = csstree.parse(input.code, { positions: true });

            csstree.walk(ast, node => {
                if (node.type === 'Url' && node.value.type === 'String') {
                    let relfilepath = extractFilepathFromNode(node);
                    let sourcedir = path.dirname(id);
                    
                    if (relfilepath) {
                        if (input.map) {
                            let inputMap = typeof input.map === 'string'? JSON.parse(input.map) : input.map;
                            let map = new SourceMap.SourceMapConsumer(inputMap);
                            let sourcefile = map.originalPositionFor(node.loc.start).source;
                            sourcedir = path.resolve(sourcedir, path.dirname(sourcefile));
                        }

                        let filepath = path.resolve(sourcedir, relfilepath);
                        if (fs.existsSync(filepath)) {
                            assets[filepath] = fs.readFileSync(filepath);
                            node.value.value = `"__ASSET__${filepath}"`;
                        } else {
                            console.warn('File not found: ' + filepath);
                        }
                    }
                }
            });

            return { 
                code: csstree.generate(ast) 
            };
        });
    }

    return pipeline;
}

module.exports = function (options) {
    let files = {};
    let assets = {};

    let opts = {
        file: options.file || 'styles.css',
        extensions: options.extensions || ['.css', '.scss', '.less'],
        loaders: options.loaders || [],
        hot: options.hot,
        url: options.url !== undefined? options.url : true
    };

    let pipeline = createLoaderPipeline(opts, assets);

    return {
        transform: async function (code, id) {
            if (opts.extensions.indexOf(path.extname(id)) === -1) {
                return;
            }

            let input = { code };
            for (let i = 0; i < pipeline.length; i++) {
                input = await pipeline[i](input, id);
            }

            files[id] = input.code;

            if (opts.hot) {
                return getHotModuleCode();
            }

            return '';
        },

        renderChunk (code, chunkInfo) {
            let output = '';

            Object.keys(chunkInfo.modules).forEach(filename => {
                if (files[filename]) {
                    output += files[filename] + '\n';
                }
            });

            Object.keys(assets).forEach(assetId => {
                // TODO: File type detection, put into a folder rather than root of assets
                let asset_ref = this.emitFile({
                    type: 'asset',
                    source: assets[assetId],
                    name: path.basename(assetId)
                });

                output = output.replace('__ASSET__' + assetId, this.getFileName(asset_ref));
            });

            // TODO: Check for extract mode, loader mode and inline mode
            let css_ref = this.emitFile({
                type: 'asset',
                source: output,
                name: opts.file
            });

            return (opts.hot? `
                ;(function () {
                    window.__css_reload = function () {
                        if (window.__styleLinkTimeout) {
                            cancelAnimationFrame(window.__styleLinkTimeout);
                        }

                        window.__styleLinkTimeout = requestAnimationFrame(() => {
                            var link = document.querySelector('link[href*="${this.getFileName(css_ref)}"]');

                            if (link) {
                                if (!window.__styleLinkHref) {
                                    window.__styleLinkHref = link.getAttribute('href');
                                }

                                var newLink = document.createElement('link');
                                newLink.setAttribute('rel', 'stylesheet');
                                newLink.setAttribute('type', 'text/css');
                                newLink.setAttribute('href', window.__styleLinkHref + '?' + Date.now());
                                newLink.onload = () => {
                                    link.remove();
                                };

                                document.head.appendChild(newLink);
                            }
                        });
                    }
                })();
            ` : '') + code;
        }
    }
}
