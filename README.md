# rollup-plugin-hot-css

A generic CSS loader for [Rollup](https://rollupjs.org). Supports Hot Module Replacement when used with [Nollup](https://github.com/PepsRyuu/nollup).

## How to use

```npm install rollup-plugin-hot-css```

```
let hotcss = require('rollup-plugin-hot-css');

module.exports = {
    ...
    experimentalCodeSplitting: true,
    plugins: [
        hotcss({
            filename: 'styles.css',
            extensions: ['.css', '.scss'],
            transform: code => {
                return scss(code);
            },
            hot: true
        })
    ]
}
```

**Note:** ```experimentalCodeSplitting``` must be enabled as this plugin uses ```emitAsset``` plugin API.

## Options

* ***String* filename -** Output file name. Default is ```styles.css```.

* ***Array<String>* extensions -** Extensions to run the plugin for. Default is ```.css, .scss, .less```

* ***Function* transform -** Function that receives the code. Return transformed code. Preprocessors such as SCSS or LESS should be executed here. Default is to return the same code.

* ***Boolean* hot -** Enable hot module replacement using &lt;link&gt; tag. This should be disabled if building for production. Default is ```false```.

## Hot Module Replacement

The HMR API expects there to be a ```link``` tag inside the ```index.html``` file.

```
<link rel="stylesheet" type="text/css" href="/styles.css">
```

When file changes are made, the link tag is replaced by appending a timestamp to the end of the ```href```. This forces the browser to download the file again.

