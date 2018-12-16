let path = require('path');

function getHotLinkTag (filename) {
    return `
        function reload () {
            if (window.__styleLinkTimeout) {
                cancelAnimationFrame(window.__styleLinkTimeout);
            }

            window.__styleLinkTimeout = requestAnimationFrame(() => {
                var link = document.querySelector('link[href*="${filename}"]');

                if (!window.__styleLinkHref) {
                    window.__styleLinkHref = link.getAttribute('href');
                }

                if (link) {
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

        reload();
        module.hot.dispose(reload);
        module.hot.accept(reload);
    `; 
}

module.exports = function (options) {
    let files = {};
    let filename = options.filename || 'styles.css';
    let extensions = options.extensions || ['.css', '.scss', '.less'];
    let transform = options.transform || (code => code); 

    return {
        transform: function (code, id) {
            if (extensions.indexOf(path.extname(id)) === -1) {
                return;
            }

            files[id] = transform(code, id);

            if (options.hot) {
                return getHotLinkTag(filename);
            }

            return '';
        },

        generateBundle (options, bundle) {
            let entryFile = options.file.split('/').pop();
            let modules = bundle[entryFile].modules;

            let output = '';
            Object.keys(modules).forEach(filename => {
                if (files[filename]) {
                    output += files[filename] + '\n';
                }
            });

            this.emitAsset(filename, output);
        }
    }
}