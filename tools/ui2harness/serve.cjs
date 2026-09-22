// Minimal static file server for the ui2 visual harness. Run:
//   node tools/ui2harness/serve.cjs [port]
const http = require('http')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')
const port = Number(process.argv[2] || 8123)

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.fon': 'application/octet-stream',
}

http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let filePath = path.join(root, urlPath)
    if (!filePath.startsWith(root)) {
        res.writeHead(403); res.end(); return
    }
    fs.stat(filePath, (err, stat) => {
        if (!err && stat.isDirectory()) {filePath = path.join(filePath, 'index.html')}
        fs.readFile(filePath, (err2, data) => {
            if (err2) {
                res.writeHead(404)
                res.end('not found: ' + urlPath)
                return
            }
            res.writeHead(200, {'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream'})
            res.end(data)
        })
    })
}).listen(port, () => {
    console.log(`ui2 harness serving ${root} at http://localhost:${port}/tools/ui2harness/ui2harness.html`)
})
