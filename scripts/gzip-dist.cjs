const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

function gzipDir(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true })
    files.forEach(f => {
        const fullPath = path.join(dir, f.name)
        if (f.isDirectory()) {
            gzipDir(fullPath)
        } else if (!f.name.endsWith('.gz') && !f.name.endsWith('.map')) {
            const src = fs.readFileSync(fullPath)
            const compressed = zlib.gzipSync(src, { level: 9 })
            fs.writeFileSync(fullPath + '.gz', compressed)
            console.log('gzipped:', fullPath + '.gz', '(' + (compressed.length / 1024).toFixed(1) + ' kB)')
        }
    })
}

gzipDir('dist')
console.log('Done.')
