let fs_impl = require('fs');
let path = require('path');

// Override node-sass require, as node-sass is basically untestable
// because we can't stub fs, and because it's incompatible with the test runner.
// Since LESS is close enough, a translation layer is provided.
(function () {
    let Module = require('module');
    let req = Module.prototype.require;
    let _load = Module._load;

    // Proxyquire doesn't use require function below.
    Module._load = function (mod, module) {
        if (mod === 'node-sass' || mod === 'sass') {
            let less = req.call(module, 'less');

            return {
                renderSync: function (obj) {
                    let output;
                    let transpiled = less.render(obj.data, {
                        async: false,
                        syncImport: true,
                        filename: obj.file,
                        sourceMap: obj.sourceMap && {
                            sourceMapRootpath: path.dirname(obj.outFile),
                            sourceMapBasepath: path.dirname(obj.outFile)
                        }
                    }, function (err, result) {
                        if (err) {
                            console.error(err);
                        }

                        output = result;
                        output.stats = {
                            includedFiles: result.imports
                        }
                    })

                    return output;
                }
            };
        }

        return _load.apply(Module, arguments);
    }

    Module.prototype.require = function(mod) {
        // For LESS to resolve internal imports.
        // Graceful does a lot of overriding of its own that conflicts with fs stub.
        if (mod === 'graceful-fs') {
            return fs;
        }

        return req.apply(this, arguments);
    };
})();

let fs = {
    '@global': true,
    _stubs: {},

    existsSync: function (file) {
        file = path.resolve(process.cwd(), file); 
        if (this._stubs[file]) {
            return true;
        }

        return fs_impl.existsSync(file);
    },

    lstatSync: function (file) {
        return {
            isSymbolicLink: () => false,
            isFile: () => true
        }
    },

    readdirSync: function (dir) {
        let output = [];

        if (fs.existsSync(dir)) {
            output = output.concat(fs.readdirSync(dir));
        }

        Object.keys(this._stubs).forEach(file => {
            if (path.dirname(file) === dir) {
                output.push(path.basename(file));
            }
        });

        return output;
    },

    readFile: function (file, encoding, callback) {
        try {
            let output = this.readFileSync(file);
            callback(null, output);
        } catch (e) {
            callback(e);
        }
    },

    readFileSync: function (file) {
        if (this._stubs[file]) {
            return this._stubs[file]();
        }

        return fs_impl.readFileSync(file, 'utf8');
    },

    reset: function () {
        this._stubs = {};
    },

    stub: function (file, callback) {
        let fullPath = path.resolve(process.cwd(), file);
        this._stubs[fullPath] = callback;
    }
}

for (let prop in fs) {
    if (typeof fs[prop] === 'function') {
        fs[prop] = fs[prop].bind(fs);
    }
}

let proxyquire = require('proxyquire');

let nollup = proxyquire('nollup', { fs });

let rollup = async (input) => await proxyquire('rollup', { fs }).rollup(input);

let expect = require('chai').expect;

let plugin = proxyquire('../index', { fs });

module.exports = {
    nollup, fs, expect, rollup, plugin
};
