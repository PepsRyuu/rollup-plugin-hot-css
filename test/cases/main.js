let { fs, expect, rollup, nollup, plugin } = require('../common');
let path = require('path');

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
                it ('should resolve urls in CSS files and emit the assets and replace the url', async () => {
                    fs.stub('./src/images/logo.svg', () => '<svg></svg>');
                    fs.stub('./src/main.css', () => `.main { background-image: url("./images/logo.svg") }`);
                    fs.stub('./src/main.js', () => `import './main.css';`);

                    let output = await generateBundle({}, entry.engine);

                    expect(/assets\/logo-(.*?)\.svg/.test(output[1].fileName)).to.be.true;
                    expect(output[1].source).to.equal(`<svg></svg>`);

                    expect(/assets\/styles-(.*?)\.css/.test(output[2].fileName)).to.be.true;
                    expect(output[2].source).to.equal(`.main{background-image:url("${output[1].fileName}")}\n`);


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

                    expect(/assets\/logo-(.*?)\.svg/.test(output[1].fileName)).to.be.true;
                    expect(output[1].source).to.equal(`<svg></svg>`);

                    expect(/assets\/styles-(.*?)\.css/.test(output[2].fileName)).to.be.true;
                    expect(output[2].source).to.equal(`.main{background-image:url("${output[1].fileName}")}\n`);


                    fs.reset();
                });

                it ('should resolve url in a root LESS file', async () => {
                    fs.stub('./src/images/logo.svg', () => '<svg></svg>');
                    fs.stub('./src/less/main.less', () => `.main { background-image: url("../images/logo.svg") }`);
                    fs.stub('./src/main.js', () => `import './less/main.less';`);

                    let output = await generateBundle({ loaders: ['less'] }, entry.engine);

                    expect(/assets\/logo-(.*?)\.svg/.test(output[1].fileName)).to.be.true;
                    expect(output[1].source).to.equal(`<svg></svg>`);

                    expect(/assets\/styles-(.*?)\.css/.test(output[2].fileName)).to.be.true;
                    expect(output[2].source).to.equal(`.main{background-image:url("${output[1].fileName}")}\n`);


                    fs.reset();
                })

                it ('should resolve urls in imported SCSS files relative to the SCSS file and not the id', async () => {
                    fs.stub('./src/scss/subdir/images/logo.svg', () => '<svg></svg>');
                    fs.stub('./src/scss/subdir/other.scss', () => `.main { background-image: url("./images/logo.svg") }`)
                    fs.stub('./src/scss/main.scss', () => `@import './subdir/other.scss';`);
                    fs.stub('./src/main.js', () => `import './scss/main.scss';`);

                    let output = await generateBundle({ loaders: ['scss'] }, entry.engine);

                    expect(/assets\/logo-(.*?)\.svg/.test(output[1].fileName)).to.be.true;
                    expect(output[1].source).to.equal(`<svg></svg>`);

                    expect(/assets\/styles-(.*?)\.css/.test(output[2].fileName)).to.be.true;
                    expect(output[2].source).to.equal(`.main{background-image:url("${output[1].fileName}")}\n`);


                    fs.reset();
                });
                
                it ('should resolve urls in imported LESS files relative to the LESS file and not the id', async () => {
                    fs.stub('./src/less/subdir/images/logo.svg', () => '<svg></svg>');
                    fs.stub('./src/less/subdir/other.less', () => `.main { background-image: url("./images/logo.svg") }`)
                    fs.stub('./src/less/main.less', () => `@import './subdir/other.less';`);
                    fs.stub('./src/main.js', () => `import './less/main.less';`);

                    let output = await generateBundle({ loaders: ['less'] }, entry.engine);

                    expect(/assets\/logo-(.*?)\.svg/.test(output[1].fileName)).to.be.true;
                    expect(output[1].source).to.equal(`<svg></svg>`);

                    expect(/assets\/styles-(.*?)\.css/.test(output[2].fileName)).to.be.true;
                    expect(output[2].source).to.equal(`.main{background-image:url("${output[1].fileName}")}\n`);

                    fs.reset();
                });  

                it ('should not resolve urls if option is set to false', async () => {
                    fs.stub('./src/images/logo.svg', () => '<svg></svg>');
                    fs.stub('./src/main.css', () => `.main { background-image: url("./images/logo.svg") }`);
                    fs.stub('./src/main.js', () => `import './main.css';`);

                    let output = await generateBundle({ url: false }, entry.engine);

                    expect(/assets\/styles-(.*?)\.css/.test(output[1].fileName)).to.be.true;
                    expect(output[1].source).to.equal(`.main { background-image: url("./images/logo.svg") }\n`);


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

        // TODO: This test is fairly fragile, need fallbacks
        it ('should replace link tag when module is updated', async () => {
            fs.stub('./src/main.css', () => `.main { color: red; }`);
            fs.stub('./src/main.js', () => `import "./main.css";`);

            let acceptCallback;

            let output = await generateBundle({
                hot: true
            }, nollup, [
                {
                    nollupModuleInit () {
                        return `
                            module.hot = {
                                accept: function (callback) {
                                    acceptCallback = callback;
                                },

                                dispose: function (callback) {
                                    this._dispose = callback;
                                }
                            };
                        `;
                    }
                }
            ]);

            let hmrphase = 0;
            let { protocol } = require('electron').remote;

            protocol.unregisterProtocol('test');
            protocol.registerBufferProtocol('test', (request, result) => {
                let content = hmrphase === 0? `
                    .main { color: red }
                ` : `
                    .main { color: blue }
                `

                if (request.url.indexOf('.css') > -1) {
                    return result({ 
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

            return new Promise(resolve => {
                setTimeout(() => {
                    expect(window.getComputedStyle(el).color).to.equal('rgb(255, 0, 0)');
                    hmrphase++;
                    acceptCallback();

                    setTimeout(() => {
                        expect(window.getComputedStyle(el).color).to.equal('rgb(0, 0, 255)')
                        delete window.__css_reload;

                        link.remove();
                        fs.reset();
                        protocol.unregisterProtocol('test');
                        resolve();
                    }, 2000);
                }, 2000)
            });
        });
    });
});