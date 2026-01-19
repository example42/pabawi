const fs = require('fs');

// Read the original file
const content = fs.readFileSync('backend/src/routes/integrations.ts', 'utf8');

// Find the start of the router function
const routerStart = content.indexOf('export function createIntegrationsRouter(');
const routerEnd = content.lastIndexOf('return router;');

console.log('✅ File analysis complete');
console.log(`   Total lines: ${content.split('\n').length}`);
console.log(`   Router starts at char: ${routerStart}`);
console.log(`   Router ends at char: ${routerEnd}`);

// Count routes by integration
const puppetdbRoutes = (content.match(/router\.(get|post|put|delete)\(\s*"\/puppetdb\//g) || []).length;
const puppetserverRoutes = (content.match(/router\.(get|post|put|delete)\(\s*"\/puppetserver\//g) || []).length;
const otherRoutes = (content.match(/router\.(get|post|put|delete)\(\s*"\/(?!puppetdb|puppetserver)/g) || []).length;

console.log(`\n📊 Route distribution:`);
console.log(`   PuppetDB routes: ${puppetdbRoutes}`);
console.log(`   Puppetserver routes: ${puppetserverRoutes}`);
console.log(`   Other routes (colors, status): ${otherRoutes}`);
console.log(`   Total routes: ${puppetdbRoutes + puppetserverRoutes + otherRoutes}`);
