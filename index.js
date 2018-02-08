const cmd = require('node-cmd')
const fs = require('fs');
const { sep: slash } = require('path');
const path = require('path');
const loaderUtils = require('loader-utils');

const spawn = require('child_process').spawn;

const properName = name => name.replace(/^./, c => c.toUpperCase());
const listify = array => array.join(', ')
    // make a comma-separated list ending with a '&' separator
    .replace(/(, )[^,]*$/, s => ' & ' + s.split(', ')[1]);

function extractJsCode(source) {
    console.log(source);
    var re = /\# js([\s\S]*?)\# endjs/g;
    var matched = re.exec(source);
    var result = source.replace(re, '');
    return {'js': matched ? matched[1] : null, 'python': result};
}

module.exports = function (source) {

    extractedCode = extractJsCode(source);
    source = extractedCode.python

    const compilers = {
        transcrypt: {
            switches: '-b -n -m',
            folder: `.${slash}__javascript__`,
            install: 'pip install transcrypt',
            python_version: '3.x',
            sourcemaps: true
        },
        jiphy: {
            switches: '',
            folder: `.${slash}`,
            install: 'pip install jiphy',
            python_version: '2.x',
            sourcemaps: false
        },
        pj: {
            switches: '--inline-map --source-name %f -s -',
            folder: `.${slash}`,
            install: 'pip install javascripthon',
            python_version: '3.x',
            streaming: true,
            sourcemaps: true
        }
    };

    const options = loaderUtils.getOptions(this);
    const compilerName = options && options.compiler || 'transcrypt';
    const compiler = compilers[compilerName];

    if (!compiler) {
        throw new Error(`py-loader only supports ${
                listify(Object.keys(compilers).map(properName))
            } compilers at present. See README.md for information on using it with others.`);
    }

    compiler.name = compilerName;
    const entry = this.resourcePath;
    //console.log(`py-loader: compiling ${entry} with ${compilerName}...`);

    const fileinfo = path.parse(entry);

    const srcDir = fileinfo.dir; // path.dirname(entry, ".py");
    var basename = fileinfo.name;
    const callback = this.async();

    if (compiler.streaming) {
        compiler.switches = compiler.switches.replace('%f', basename);

        var child = spawn(compiler.name, compiler.switches.split(' '));
        child.stdin.write(source);

        var data = extractedCode.js ? extractedCode.js : '';
        var error = '';
        var sourceMap = '';
        child.stdout.on('data', function (js) {
            data = data + js;
        });
        child.stderr.on('data', function (msg) {
            error = error + msg;
        });
        child.on('exit', function () {
            if (compiler.sourcemaps) {
                sourcemapLine = data.split('\n').splice(-3,1)[0]; // Javascripthon specific?
                sourceMap = new Buffer(sourcemapLine.substring(sourcemapLine.indexOf('base64,') + 7), 'base64').toString();
            }
            if (error != '') {
                console.error(error.toString());
                callback(null, error, sourceMap)  }
            else {
                callback(null, data, sourceMap);
            }
        });
        child.on('error', function(err) {
            console.error(`Some error occurred on ${properName(compiler.name)} compiler execution. Have you installed ${properName(compiler.name)}? If not, please run \`${compiler.install}\` (requires Python ${compiler.python_version})`);
            callback(err);
        });
        child.stdin.end();
    }
    else {
        basename = `__${fileinfo.name}`
        fs.writeFileSync(`${srcDir}${slash}__${fileinfo.name}.py`, source);

        cmd.get(`${compiler.name} ${compiler.switches} ${srcDir}${slash}${basename}.py`, function(err, data, stderr) {

            if (!err) {
                const filename = `${srcDir}${slash}${compiler.folder}${slash}${basename}.js`;
                js = fs.readFileSync(filename, "utf8");

                if (extractedCode.js) 
                    js = extractedCode.js + js;

                fs.unlinkSync(filename);

                fs.unlinkSync(`${srcDir}${slash}__${fileinfo.name}.py`);

                if (compiler.sourcemaps) {
                    const sourceMapFile = `${srcDir}${slash}${compiler.folder}${slash}extra${slash}sourcemap${slash}${basename}.js`;
                    sourceMap = fs.readFileSync(sourceMapFile + ".map", "utf8")
                    fs.unlinkSync(sourceMapFile + ".map");
                    callback(null, js, sourceMap); }
                else {
                    callback(null, js);
                }

            }
            else {
                console.log(stderr)
                // console.error(`Some error occurred on ${properName(compiler.name)} compiler execution. Have you installed ${properName(compiler.name)}? If not, please run \`${compiler.install}\` (requires Python ${compiler.python_version})`);
                callback(err);
            }

        });
    }
}
