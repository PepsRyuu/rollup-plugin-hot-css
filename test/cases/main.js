let { fs, expect, rollup, nollup, plugin } = require('../common');
let path = require('path');

if (!window.__protocol_registered) {
    window.__protocol_registered = true;
    
    let { protocol } = require('electron').remote;

    protocol.unregisterProtocol('test');
    protocol.registerBufferProtocol('test', (request, result) => {
        window.__protocol_callback(request, result);
    });
}

window.__protocol_callback = () => {};

function registerProtocolCallback (callback) {
    window.__protocol_callback = callback;
}

function unregisterProtocolCallback () {
    window.__protocol_callback = () => {};
}

async function generateImpl (options, engine, extra_plugins = []) {
    let bundle = await engine({
        input: './src/main.js',
        plugins: [
            plugin(options),
            ...extra_plugins
        ]
    });

    let response = await bundle.generate({ format: 'esm' });
    return response;
}

function wait (delay) {
    return new Promise(resolve => {
        setTimeout(resolve, delay);
    });
}

async function generateBundle (options, engine, extra_plugins) {
    return (await generateImpl(options, engine, extra_plugins)).output;
}

describe('Rollup Plugin Hot CSS', function () {
    this.timeout(10000);

    [{
        title: 'Rollup',
        engine: rollup
    }, {
        title: 'Nollup',
        engine: nollup
    }].forEach(entry => {
        describe(entry.title, () => {
            describe('Extract CSS', () => {
                it ('should extract simple css to a separate file with default filename', async () => {
                    fs.stub('./src/main.css', () => `.main { color: red; }`);
                    fs.stub('./src/main.js', () => `import "./main.css";` )

                    let output = await generateBundle({}, entry.engine);

                    expect(/assets\/styles-(.*?)\.css/.test(output[1].fileName)).to.be.true;
                    expect(output[1].source).to.equal('.main{color:red}\n');

                    fs.reset();
                });

                it ('should allow renaming of the exported file', async () => {
                    fs.stub('./src/main.css', () => `.main { color: red; }`);
                    fs.stub('./src/main.js', () => `import "./main.css";`);

                    let output = await generateBundle({
                        file: 'lol.css'
                    }, entry.engine);

                    expect(/assets\/lol-(.*?)\.css/.test(output[1].fileName)).to.be.true;
                    fs.reset();
                });

                it ('should support multiple imported css files and concatenate them', async () => {
                    fs.stub('./src/other.css', () => `.other { color: green; }`);
                    fs.stub('./src/main.css', () => `.main { color: red; }`);
                    fs.stub('./src/main.js', () => `import "./main.css"; import "./other.css";`);

                    let output = await generateBundle({}, entry.engine);

                    expect(output[1].source).to.equal('.main{color:red}\n.other{color:green}\n');

                    fs.reset();
                });

                it ('should support multiple imported css files by multiple files', async () => {
                    fs.stub('./src/other.css', () => `.other { color: green; }`);
                    fs.stub('./src/main.css', () => `.main { color: red; }`);
                    fs.stub('./src/other.js', () => `import "./other.css";`)
                    fs.stub('./src/main.js', () => `import "./main.css"; import "./other";`);
                    let output = await generateBundle({}, entry.engine);

                    expect(output[1].source).to.equal('.main{color:red}\n.other{color:green}\n');

                    fs.reset();
                });

                it ('should support CSS imported in a circular dependency tree', async () => {
                    fs.stub('./src/main.css', () => `.main { color: red; }`);
                    fs.stub('./src/other.js', () => `import "./main";`)
                    fs.stub('./src/main.js', () => `import "./main.css"; import "./other";`);
                    let output = await generateBundle({}, entry.engine);

                    expect(output[1].source).to.equal('.main{color:red}\n');

                    fs.reset();
                });

                it ('should not include removed CSS on rebuild', async () => {
                    fs.stub('./src/other.css', () => `.other { color: green; }`);
                    fs.stub('./src/main.css', () => `.main { color: red; }`);
                    fs.stub('./src/other.js', () => `import "./other.css";`)
                    fs.stub('./src/main.js', () => `import "./main.css"; import "./other";`);
                    let output = await generateBundle({}, entry.engine);

                    expect(output[1].source).to.equal('.main{color:red}\n.other{color:green}\n');

                    fs.stub('./src/main.js', () => `import "./main.css";`);

                    output = await generateBundle({}, entry.engine);
                    expect(output[1].source).to.equal('.main{color:red}\n');

                    fs.reset();
                });
            });

            describe('Less', () => {
                it ('should not be enabled by default', async () => {
                    fs.stub('./src/main.less', () => `.main { &.subclass { color: red; } }`);
                    fs.stub('./src/main.js', () => `import "./main.less";`);

                    let output = await generateBundle({}, entry.engine);

                    expect(output[1].source).to.equal('.main{&.subclass { color: red; }}\n');

                    fs.reset();
                });

                it ('should support less loader option', async () => {
                    fs.stub('./src/main.less', () => `.main { &.subclass { color: red; } }`);
                    fs.stub('./src/main.js', () => `import "./main.less";`);

                    let output = await generateBundle({
                        loaders: ['less']
                    }, entry.engine);

                    expect(output[1].source).to.equal('.main.subclass{color:red}\n');

                    fs.reset();
                });

                it ('should allow nested imports', async () => {
                    fs.stub('./src/other.less', () => `.main { &.subclass { color: red } }`);
                    fs.stub('./src/main.less', () => `@import './other.less';`);
                    fs.stub('./src/main.js', () => `import "./main.less";`);

                    let output = await generateBundle({
                        loaders: ['less']
                    }, entry.engine);

                    expect(output[1].source).to.equal('.main.subclass{color:red}\n'); 

                    fs.reset();
                });
            });

            describe('SCSS', () => {
                it ('should not be enabled by default', async () => {
                    fs.stub('./src/main.scss', () => `.main { &.subclass { color: red; } }`);
                    fs.stub('./src/main.js', () => `import "./main.scss";`)

                    let output = await generateBundle({}, entry.engine);

                    expect(output[1].source).to.equal('.main{&.subclass { color: red; }}\n');

                    fs.reset();
                });                

                // Using the LESS translation layer
                it ('should support SCSS Loader', async () => {
                    fs.stub('./src/main.scss', () => `.main { &.subclass { color: red; } }`);
                    fs.stub('./src/main.js', () => `import "./main.scss";`);

                    let output = await generateBundle({
                        loaders: ['scss']
                    }, entry.engine);

                    expect(output[1].source).to.equal('.main.subclass{color:red}\n');

                    fs.reset();
                });

                it ('should allow nested imports', async () => {
                    fs.stub('./src/other.scss', () => `.main { &.subclass { color: red } }`);
                    fs.stub('./src/main.scss', () => `@import './other.scss';`);
                    fs.stub('./src/main.js', () => `import "./main.scss";`);

                    let output = await generateBundle({
                        loaders: ['scss']
                    }, entry.engine);

                    expect(output[1].source).to.equal('.main.subclass{color:red}\n'); 

                    fs.reset();
                });
            });

            describe('URL Resolving', () => {
                function findOutput(output, regex) {
                    for (let i = 0; i < output.length; i++) {
                        if (regex.test(output[i].fileName)) {
                            return output[i];
                        }
                    }
                }

                it ('should resolve urls in CSS files and emit the assets and replace the url', async () => {
                    fs.stub('./src/images/logo.svg', () => '<svg></svg>');
                    fs.stub('./src/main.css', () => `.main { background-image: url("./images/logo.svg") }`);
                    fs.stub('./src/main.js', () => `import './main.css';`);

                    let output = await generateBundle({}, entry.engine);
                    let logo = findOutput(output, /assets\/logo-(.*?)\.svg/);
                    let styles = findOutput(output, /assets\/styles-(.*?)\.css/);

                    expect(logo.source).to.equal(`<svg></svg>`);
                    expect(styles.source).to.equal(`.main{background-image:url("${path.basename(logo.fileName)}")}\n`);


                    fs.reset();
                });

                it ('should ignore data urls', async () => {
                    fs.stub('./src/main.css', () => `.main { background-image: url("data:svg+xml,base64;<svg></svg>") }`);
                    fs.stub('./src/main.js', () => `import './main.css';`);

                    let output = await generateBundle({}, entry.engine);

                    expect(output.length).to.equal(2);
                    expect(output[1].source).to.equal(`.main{background-image:url("data:svg+xml,base64;<svg></svg>")}\n`);

                    fs.reset();
                });

                it ('should resolve url in a root SCSS file', async () => {
                    fs.stub('./src/images/logo.svg', () => '<svg></svg>');
                    fs.stub('./src/scss/main.scss', () => `.main { background-image: url("../images/logo.svg") }`);
                    fs.stub('./src/main.js', () => `import './scss/main.scss';`);

                    let output = await generateBundle({ loaders: ['scss'] }, entry.engine);

                    let logo = findOutput(output, /assets\/logo-(.*?)\.svg/);
                    let styles = findOutput(output, /assets\/styles-(.*?)\.css/);
                    expect(logo.source).to.equal(`<svg></svg>`);
                    expect(styles.source).to.equal(`.main{background-image:url("${path.basename(logo.fileName)}")}\n`);

                    fs.reset();
                });

                it ('should resolve url in a root LESS file', async () => {
                    fs.stub('./src/images/logo.svg', () => '<svg></svg>');
                    fs.stub('./src/less/main.less', () => `.main { background-image: url("../images/logo.svg") }`);
                    fs.stub('./src/main.js', () => `import './less/main.less';`);

                    let output = await generateBundle({ loaders: ['less'] }, entry.engine);

                    let logo = findOutput(output, /assets\/logo-(.*?)\.svg/);
                    let styles = findOutput(output, /assets\/styles-(.*?)\.css/);
                    expect(logo.source).to.equal(`<svg></svg>`);
                    expect(styles.source).to.equal(`.main{background-image:url("${path.basename(logo.fileName)}")}\n`);

                    fs.reset();
                })

                it ('should resolve urls in imported SCSS files relative to the SCSS file and not the id', async () => {
                    fs.stub('./src/scss/subdir/images/logo.svg', () => '<svg></svg>');
                    fs.stub('./src/scss/subdir/other.scss', () => `.main { background-image: url("./images/logo.svg") }`)
                    fs.stub('./src/scss/main.scss', () => `@import './subdir/other.scss';`);
                    fs.stub('./src/main.js', () => `import './scss/main.scss';`);

                    let output = await generateBundle({ loaders: ['scss'] }, entry.engine);

                    let logo = findOutput(output, /assets\/logo-(.*?)\.svg/);
                    let styles = findOutput(output, /assets\/styles-(.*?)\.css/);
                    expect(logo.source).to.equal(`<svg></svg>`);
                    expect(styles.source).to.equal(`.main{background-image:url("${path.basename(logo.fileName)}")}\n`);

                    fs.reset();
                });
                
                it ('should resolve urls in imported LESS files relative to the LESS file and not the id', async () => {
                    fs.stub('./src/less/subdir/images/logo.svg', () => '<svg></svg>');
                    fs.stub('./src/less/subdir/other.less', () => `.main { background-image: url("./images/logo.svg") }`)
                    fs.stub('./src/less/main.less', () => `@import './subdir/other.less';`);
                    fs.stub('./src/main.js', () => `import './less/main.less';`);

                    let output = await generateBundle({ loaders: ['less'] }, entry.engine);

                    let logo = findOutput(output, /assets\/logo-(.*?)\.svg/);
                    let styles = findOutput(output, /assets\/styles-(.*?)\.css/);
                    expect(logo.source).to.equal(`<svg></svg>`);
                    expect(styles.source).to.equal(`.main{background-image:url("${path.basename(logo.fileName)}")}\n`);

                    fs.reset();
                });  

                it ('should not resolve urls if option is set to false', async () => {
                    fs.stub('./src/images/logo.svg', () => '<svg></svg>');
                    fs.stub('./src/main.css', () => `.main { background-image: url("./images/logo.svg") }`);
                    fs.stub('./src/main.js', () => `import './main.css';`);

                    let output = await generateBundle({ url: false }, entry.engine);

                    let styles = findOutput(output, /assets\/styles-(.*?)\.css/);
                    expect(styles.source).to.equal(`.main { background-image: url("./images/logo.svg") }\n`);

                    fs.reset();
                });         
                
                it ('should resolve the same url multiple times', async () => {
                    fs.stub('./src/images/logo.svg', () => '<svg></svg>');
                    fs.stub('./src/scss/main.scss', () => `
                        .main { background-image: url("../images/logo.svg") }
                        .other { background-image: url("../images/logo.svg") }
                    `);
                    fs.stub('./src/main.js', () => `import './scss/main.scss';`);

                    let output = await generateBundle({ loaders: ['scss'] }, entry.engine);
                    let logo = findOutput(output, /assets\/logo-(.*?)\.svg/);
                    let styles = findOutput(output, /assets\/styles-(.*?)\.css/);
                    expect(logo.source).to.equal(`<svg></svg>`);
                    expect(styles.source.indexOf(`.main{background-image:url("${path.basename(logo.fileName)}")}`) > -1).to.be.true;
                    expect(styles.source.indexOf(`.other{background-image:url("${path.basename(logo.fileName)}")}`) > -1).to.be.true;

                    fs.reset();
                });
            });

            describe('Loaders', () => {
                it ('should allow custom loaders', async () => {
                    fs.stub('./src/main.css', () => `.main { color: red; }`);
                    fs.stub('./src/main.js', () => `import "./main.css";`);

                    function MyCustomLoader (input, id) {
                        expect(id).to.equal(path.resolve(process.cwd(), './src/main.css'));

                        return {
                            code: input.code.replace('red', 'green')
                        };
                    }

                    let output = await generateBundle({
                        loaders: [MyCustomLoader]
                    }, entry.engine);

                    expect(output[1].source).to.equal('.main{color:green}\n');

                    fs.reset();
                });

                it ('should allow custom loaders to pass source maps to next step', async () => {
                    fs.stub('./src/main.css', () => `.main { color: red; }`);
                    fs.stub('./src/main.js', () => `import "./main.css";`);

                    function MyFirstLoader (input, id) {
                        return {
                            code: '.main { color: pink; }',
                            map: '{"version": 3}'
                        }
                    }

                    function MySecondLoader (input, id) {
                        expect(input.code).to.equal('.main { color: pink; }');
                        expect(input.map).to.equal('{"version": 3}');

                        return { code: input.code };
                    }

                    let output = await generateBundle({
                        loaders: [MyFirstLoader, MySecondLoader]
                    }, entry.engine);

                    expect(output[1].source).to.equal('.main{color:pink}\n');

                    fs.reset();
                }); 

                it ('should allow custom asynchronous loaders', async () => {
                    fs.stub('./src/main.css', () => `.main { color: red; }`);
                    fs.stub('./src/main.js', () => `import "./main.css";`);

                    function MyFirstLoader (input, id) {
                        return new Promise(resolve => resolve({
                            code: '.main { color: pink; }',
                            map: '{"version": 3}'
                        }));
                    }

                    function MySecondLoader (input, id) {
                        expect(input.code).to.equal('.main { color: pink; }');
                        expect(input.map).to.equal('{"version": 3}');

                        return new Promise(resolve => resolve({ 
                            code: input.code 
                        }));
                    }

                    let output = await generateBundle({
                        loaders: [MyFirstLoader, MySecondLoader]
                    }, entry.engine);

                    expect(output[1].source).to.equal('.main{color:pink}\n');

                    fs.reset();
                });
            });
        });
    });

    describe('HMR', () => {
        let hmr_handle = {};

        let hmr_plugin = function () {
            return {
                nollupModuleInit () {
                    return `
                        module.hot = {
                            accept: function (callback) {
                                hmr_handle.accept = callback;
                            },

                            dispose: function (callback) {
                                hmr_handle.dispose = callback;
                            }
                        };
                    `;
                }
            }
        }

        function clear () {
            hmr_handle = {};
            delete window.__css_reload;
            delete window.__css_registered;
            delete window.__css_register;
            unregisterProtocolCallback();
            fs.reset();

            [].forEach.call(document.querySelectorAll('link'), el => {
                el.remove()
            });
        }

        beforeEach(() => clear());
        afterEach(() => clear());

        it ('should replace link tag when module is updated', async () => {
            fs.stub('./src/main.css', () => `.main { color: red; }`);
            fs.stub('./src/main.js', () => `import "./main.css";`);

            let output = await generateBundle({ hot: true }, nollup, [ hmr_plugin() ]);
            let hmrphase = 0;

            registerProtocolCallback((req, res) => {
                let content = hmrphase === 0? `
                    .main { color: red }
                ` : `
                    .main { color: blue }
                `

                if (req.url.indexOf('.css') > -1) {
                    return res({ 
                        mimeType: 'text/css', 
                        data: Buffer.from(content) 
                    });
                }
            });

            let link = document.createElement('link');
            link.setAttribute('rel', 'stylesheet');
            link.setAttribute('type', 'text/css');
            link.setAttribute('href', 'test://assets/styles-[hash].css');
            document.head.appendChild(link);

            let el = document.createElement('div');
            el.setAttribute('class', 'main');
            el.textContent = 'hello';
            document.body.appendChild(el);

            eval(output[0].code);

            await wait(2000);

            expect(window.getComputedStyle(el).color).to.equal('rgb(255, 0, 0)');
            hmrphase++;
            hmr_handle.accept();

            await wait(2000);

            expect(window.getComputedStyle(el).color).to.equal('rgb(0, 0, 255)');
        });

        it ('should replace link tag when module is removed and re-added', async () => {
            fs.stub('./src/other.css', () => `.other { color: blue; }`);
            fs.stub('./src/main.css', () => `.main { color: red; }`);
            fs.stub('./src/main.js', () => `import "./main.css"; import "./other.css";`);

            let output = await generateBundle({ hot: true }, nollup, [ hmr_plugin() ]);

            registerProtocolCallback((req, res) => {
                if (req.url.indexOf('.css') > -1) {
                    let content = output[1].source;

                    return res({ 
                        mimeType: 'text/css', 
                        data: Buffer.from(content) 
                    });
                }
            });

            let link = document.createElement('link');
            link.setAttribute('rel', 'stylesheet');
            link.setAttribute('type', 'text/css');
            link.setAttribute('href', 'test://assets/styles-[hash].css');
            document.head.appendChild(link);

            // setup the hmr accepts
            eval(output[0].code);

            await wait(2000);

            expect(document.styleSheets[0].cssRules[0].cssText).to.equal('.main { color: red; }');
            expect(document.styleSheets[0].cssRules[1].cssText).to.equal('.other { color: blue; }');

            fs.stub('./src/main.js', () => `import "./main.css";`);      
            output = await generateBundle({ hot: true }, nollup, [ hmr_plugin() ]);
            hmr_handle.accept();

            await wait(2000);

            expect(document.styleSheets.length).to.equal(1);
            expect(document.styleSheets[0].cssRules.length).to.equal(1);
            expect(document.styleSheets[0].cssRules[0].cssText).to.equal('.main { color: red; }');

            fs.stub('./src/main.js', () => `import "./main.css"; import "./other.css";`);      
            output = await generateBundle({ hot: true }, nollup, [ hmr_plugin() ]);
            hmr_handle.accept();

            await wait(2000);

            expect(document.styleSheets.length).to.equal(1);
            expect(document.styleSheets[0].cssRules.length).to.equal(2);
            expect(document.styleSheets[0].cssRules[0].cssText).to.equal('.main { color: red; }');
            expect(document.styleSheets[0].cssRules[1].cssText).to.equal('.other { color: blue; }');
        });

        it('should prepend public path to asset file name for HMR', async () => {
            fs.stub('./src/main.css', () => `.main { color: red; }`);
            fs.stub('./src/main.js', () => `import "./main.css";`);

            let output = await generateBundle({ hot: true, publicPath: '/myapp' }, nollup, [ hmr_plugin() ]);
            let hmrphase = 0;

            registerProtocolCallback((req, res) => {
                let content = hmrphase === 0? `
                    .main { color: red }
                ` : `
                    .main { color: blue }
                `

                if (req.url.indexOf('.css') > -1) {
                    return res({ 
                        mimeType: 'text/css', 
                        data: Buffer.from(content) 
                    });
                }
            });

            let link = document.createElement('link');
            link.setAttribute('rel', 'stylesheet');
            link.setAttribute('type', 'text/css');
            link.setAttribute('href', 'test://myapp/assets/styles-[hash].css');
            document.head.appendChild(link);

            let el = document.createElement('div');
            el.setAttribute('class', 'main');
            el.textContent = 'hello';
            document.body.appendChild(el);

            eval(output[0].code);

            await wait(2000);

            expect(window.getComputedStyle(el).color).to.equal('rgb(255, 0, 0)');
            hmrphase++;
            hmr_handle.accept();

            await wait(2000);

            expect(window.getComputedStyle(el).color).to.equal('rgb(0, 0, 255)');
        });

        it('should only affect rel="stylesheet" link tags with the href', async () => {
            fs.stub('./src/main.css', () => `.main { color: red; }`);
            fs.stub('./src/main.js', () => `import "./main.css";`);

            let output = await generateBundle({ hot: true, publicPath: '/myapp' }, nollup, [ hmr_plugin() ]);
            let hmrphase = 0;

            registerProtocolCallback((req, res) => {
                let content = hmrphase === 0? `
                    .main { color: red }
                ` : `
                    .main { color: blue }
                `

                if (req.url.indexOf('.css') > -1) {
                    return res({ 
                        mimeType: 'text/css', 
                        data: Buffer.from(content) 
                    });
                }
            });

            let stylePath = 'test://myapp/assets/styles-[hash].css';

            let preload = document.createElement('link');
            preload.setAttribute('rel', 'preload');
            preload.setAttribute('href', stylePath);
            document.head.appendChild(preload);

            let link = document.createElement('link');
            link.setAttribute('rel', 'stylesheet');
            link.setAttribute('type', 'text/css');
            link.setAttribute('href', stylePath);
            document.head.appendChild(link);

            let el = document.createElement('div');
            el.setAttribute('class', 'main');
            el.textContent = 'hello';
            document.body.appendChild(el);

            eval(output[0].code);

            await wait(2000);

            expect(window.getComputedStyle(el).color).to.equal('rgb(255, 0, 0)');
            let preload0 = document.querySelector('link[rel="preload"]');
            let link0 = document.querySelector('link[rel="stylesheet"]');
            expect(preload0.getAttribute('href')).to.equal(stylePath);
            expect(link0.getAttribute('href').startsWith(stylePath)).to.be.true;
            hmrphase++;
            hmr_handle.accept();

            await wait(2000);
            let preload1 = document.querySelector('link[rel="preload"]');
            let link1 = document.querySelector('link[rel="stylesheet"]');
            expect(preload1.getAttribute('href')).to.equal(stylePath);
            expect(link1.getAttribute('href').startsWith(stylePath + '?')).to.be.true;

            expect(window.getComputedStyle(el).color).to.equal('rgb(0, 0, 255)');
        });


        describe('Watch Files', () => {
            it ('should call addWatchFile for each watchFile returned by a loader (less)', async () => {
                fs.stub('./src/other.less', () => `.main { &.subclass { color: red } }`);
                fs.stub('./src/main.less', () => `@import './other.less';`);
                fs.stub('./src/main.js', () => `import "./main.less";`);

                let bundle = await nollup({
                    input: './src/main.js',
                    plugins: [
                        plugin({ loaders: ['less'] })
                    ]
                });

                let result = await bundle.generate({ format: 'esm' });
                expect(result.output[1].source).to.equal('.main.subclass{color:red}\n'); 

                fs.stub('./src/other.less', () => `.main { &.subclass { color: blue } }`);

                bundle.invalidate(path.resolve(process.cwd(), './src/other.less'));

                result = await bundle.generate({ format: 'esm' });
                expect(result.output[1].source).to.equal('.main.subclass{color:blue}\n'); 

                fs.reset();
            });

            it ('should call addWatchFile for each watchFile returned by a loader (scss)', async () => {
                fs.stub('./src/other.scss', () => `.main { &.subclass { color: red } }`);
                fs.stub('./src/main.scss', () => `@import './other.scss';`);
                fs.stub('./src/main.js', () => `import "./main.scss";`);

                let bundle = await nollup({
                    input: './src/main.js',
                    plugins: [
                        plugin({ loaders: ['scss'] })
                    ]
                });

                let result = await bundle.generate({ format: 'esm' });
                expect(result.output[1].source).to.equal('.main.subclass{color:red}\n'); 

                fs.stub('./src/other.scss', () => `.main { &.subclass { color: blue } }`);

                bundle.invalidate(path.resolve(process.cwd(), './src/other.scss'));

                result = await bundle.generate({ format: 'esm' });
                expect(result.output[1].source).to.equal('.main.subclass{color:blue}\n'); 

                fs.reset();
            });

            it ('should call addWatchFile for each watchFile returned by a loader (custom)', async () => {
                fs.stub('./src/other.pss', () => `.lol { color: red }`);
                fs.stub('./src/main.pss', () => ``);
                fs.stub('./src/main.js', () => `import "./main.pss";`);

                let bundle = await nollup({
                    input: './src/main.js',
                    plugins: [
                        plugin({ 
                            extensions: ['.pss'],
                            loaders: [
                                function (input, id) {
                                    let other = path.resolve(process.cwd(), './src/other.pss');
                                    return {
                                        code: fs.readFileSync(other, 'utf8'),
                                        watchFiles: [other]
                                    }
                                }
                            ]
                        })
                    ]
                });

                let result = await bundle.generate({ format: 'esm' });
                expect(result.output[1].source).to.equal('.lol{color:red}\n'); 

                fs.stub('./src/other.pss', () => `.lol { color: blue }`);

                bundle.invalidate(path.resolve(process.cwd(), './src/other.pss'));

                result = await bundle.generate({ format: 'esm' });
                expect(result.output[1].source).to.equal('.lol{color:blue}\n'); 

                fs.reset();
            });
        });

        describe('Parallel', () => {
            it('should support multiple parallel files to update', async () => {
                fs.stub('./src/main.css', () => `.mainA { color: red; }`);
                fs.stub('./src/main.js', () => `import "./main.css";`);
                let outputA = await generateBundle({ hot: true, publicPath: '/app-a' }, nollup, [ hmr_plugin() ]);
                fs.stub('./src/main.css', () => `.mainB { color: red; }`);
                let outputB = await generateBundle({ hot: true, publicPath: '/app-b' }, nollup, [ hmr_plugin() ]);
               
                let hmrphase = 0;

                registerProtocolCallback((req, res) => {
                    let postfix = req.url.indexOf('/app-a') > -1? 'A' : 'B';
                    let content = hmrphase === 0? `
                        .main${postfix} { color: red }
                    ` : `
                        .main${postfix} { color: blue }
                    `

                    if (req.url.indexOf('.css') > -1) {
                        return res({ 
                            mimeType: 'text/css', 
                            data: Buffer.from(content) 
                        });
                    }
                });

                let linkA = document.createElement('link');
                linkA.setAttribute('rel', 'stylesheet');
                linkA.setAttribute('type', 'text/css');
                linkA.setAttribute('href', 'test://app-a/assets/styles-[hash].css');
                document.head.appendChild(linkA);

                let linkB = document.createElement('link');
                linkB.setAttribute('rel', 'stylesheet');
                linkB.setAttribute('type', 'text/css');
                linkB.setAttribute('href', 'test://app-b/assets/styles-[hash].css');
                document.head.appendChild(linkB);

                let elA = document.createElement('div');
                elA.setAttribute('class', 'mainA');
                elA.textContent = 'hello';
                document.body.appendChild(elA);

                let elB = document.createElement('div');
                elB.setAttribute('class', 'mainB');
                elB.textContent = 'hello';
                document.body.appendChild(elB);

                eval(outputA[0].code);
                eval(outputB[0].code);

                await wait(2000);

                expect(window.getComputedStyle(elA).color).to.equal('rgb(255, 0, 0)');
                expect(window.getComputedStyle(elB).color).to.equal('rgb(255, 0, 0)');
                hmrphase++;
                hmr_handle.accept();

                await wait(2000);

                expect(window.getComputedStyle(elA).color).to.equal('rgb(0, 0, 255)');
                expect(window.getComputedStyle(elB).color).to.equal('rgb(0, 0, 255)');
            });
        });


    });
});