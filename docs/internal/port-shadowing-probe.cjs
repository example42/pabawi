// Reproduce the supertest lifecycle: listen(0) -> read port -> connect -> close.
// Every server answers with its OWN unique id. If a client ever reads an id that
// is not the one it just created, the request reached a foreign server.
const http = require('http');

const ID = `${process.pid}-${process.argv[2] || '0'}`;
let n = 0, mismatches = 0, errors = {};

function once() {
  return new Promise((resolve) => {
    const myId = `${ID}-${n++}`;
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(myId);
    });
    // This is exactly what supertest does: listen(0), then read the port
    // synchronously and issue the request.
    server.listen(0);
    const port = server.address().port;
    const req = http.request({ host: '127.0.0.1', port, path: '/x', agent: false }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (body !== myId) {
          mismatches++;
          console.log(`MISMATCH pid=${process.pid} port=${port} status=${res.statusCode} expected=${myId} got=${JSON.stringify(body.slice(0, 60))}`);
        }
        server.close();
        resolve();
      });
    });
    req.on('error', (e) => {
      errors[e.code] = (errors[e.code] || 0) + 1;
      server.close();
      resolve();
    });
    req.end();
  });
}

(async () => {
  const N = Number(process.argv[3] || 4000);
  for (let i = 0; i < N; i++) await once();
  console.log(`pid=${process.pid} done requests=${N} mismatches=${mismatches} errors=${JSON.stringify(errors)}`);
})();
