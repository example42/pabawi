# Expert Mode Testing Checklist

**Date**: _______________  
**Tester**: _______________  
**Environment**: _______________

## Pre-Testing Setup

- [ ] Backend server running (`npm run dev`)
- [ ] `curl` and `jq` installed
- [ ] Test scripts are executable (`chmod +x *.sh`)
- [ ] Server accessible at <http://localhost:3000>

## Automated Testing

- [ ] Run automated test script: `./manual-test-expert-mode.sh`
- [ ] Review results file: `expert-mode-test-results.txt`
- [ ] All routes passed: _____ / 58
- [ ] Failed routes documented below

### Failed Routes (if any)

| Route | Issue | Notes |
|-------|-------|-------|
|       |       |       |
|       |       |       |
|       |       |       |

## Route Category Testing

### Inventory Routes (3/3)

- [ ] GET /api/inventory
- [ ] GET /api/inventory/sources
- [ ] GET /api/inventory/:id

### PuppetDB Routes (11/11)

- [ ] GET /api/integrations/puppetdb/nodes
- [ ] GET /api/integrations/puppetdb/nodes/:certname
- [ ] GET /api/integrations/puppetdb/nodes/:certname/facts
- [ ] GET /api/integrations/puppetdb/nodes/:certname/resources
- [ ] GET /api/integrations/puppetdb/nodes/:certname/reports
- [ ] GET /api/integrations/puppetdb/reports/:hash
- [ ] GET /api/integrations/puppetdb/reports/summary ⭐
- [ ] GET /api/integrations/puppetdb/nodes/:certname/catalog
- [ ] GET /api/integrations/puppetdb/events
- [ ] GET /api/integrations/puppetdb/admin/summary-stats
- [ ] GET /api/integrations/puppetdb/metrics

### Puppetserver Routes (14/14)

- [ ] GET /api/integrations/puppetserver/environments
- [ ] GET /api/integrations/puppetserver/environments/:env/classes
- [ ] GET /api/integrations/puppetserver/environments/:env/modules
- [ ] POST /api/integrations/puppetserver/catalog/compile
- [ ] GET /api/integrations/puppetserver/nodes
- [ ] GET /api/integrations/puppetserver/nodes/:certname
- [ ] GET /api/integrations/puppetserver/nodes/:certname/catalog
- [ ] POST /api/integrations/puppetserver/catalog/compare
- [ ] GET /api/integrations/puppetserver/certificate-requests
- [ ] POST /api/integrations/puppetserver/certificate-requests/:certname/sign
- [ ] DELETE /api/integrations/puppetserver/certificate-requests/:certname
- [ ] GET /api/integrations/puppetserver/certificates/:certname
- [ ] DELETE /api/integrations/puppetserver/certificates/:certname
- [ ] GET /api/integrations/puppetserver/status

### Hiera Routes (13/13)

- [ ] GET /api/integrations/hiera/scan
- [ ] POST /api/integrations/hiera/lookup
- [ ] GET /api/integrations/hiera/keys
- [ ] GET /api/integrations/hiera/files
- [ ] POST /api/integrations/hiera/resolve
- [ ] GET /api/integrations/hiera/hierarchy
- [ ] POST /api/integrations/hiera/analyze
- [ ] GET /api/integrations/hiera/modules
- [ ] GET /api/integrations/hiera/forge/search
- [ ] GET /api/integrations/hiera/forge/module/:name
- [ ] POST /api/integrations/hiera/catalog/compile
- [ ] POST /api/integrations/hiera/code/analyze
- [ ] GET /api/integrations/hiera/puppetfile

### Execution Routes (6/6)

- [ ] GET /api/executions
- [ ] GET /api/executions/:id
- [ ] POST /api/executions/:id/re-execute
- [ ] DELETE /api/executions/:id
- [ ] GET /api/executions/stats
- [ ] POST /api/executions/cleanup

### Task Routes (3/3)

- [ ] POST /api/nodes/:id/task
- [ ] GET /api/tasks
- [ ] GET /api/tasks/:name

### Command Routes (1/1)

- [ ] POST /api/nodes/:id/command

### Package Routes (2/2)

- [ ] POST /api/nodes/:id/packages/install
- [ ] POST /api/nodes/:id/packages/uninstall

### Facts Routes (1/1)

- [ ] POST /api/nodes/:id/facts

### Puppet Routes (1/1)

- [ ] POST /api/nodes/:id/puppet-run

### Streaming Routes (2/2)

- [ ] GET /api/streaming/executions/:id
- [ ] POST /api/streaming/executions/:id/cancel

### Status Routes (1/1)

- [ ] GET /api/integrations/

## Verification Criteria

For each route tested, verify:

### Expert Mode Enabled

- [ ] Response includes `_debug` field
- [ ] `_debug.timestamp` is present
- [ ] `_debug.operation` is present
- [ ] `_debug.duration` is present
- [ ] `_debug.correlationId` matches request header
- [ ] Error responses include `_debug.errors` array
- [ ] Errors array contains error details
- [ ] Performance metrics included

### Expert Mode Disabled

- [ ] Response does NOT include `_debug` field
- [ ] No debug information leaked

## External API Error Testing

Test that external integration errors are captured:

### PuppetDB Errors

- [ ] Connection errors captured
- [ ] Authentication errors captured
- [ ] Query errors captured
- [ ] Timeout errors captured

### Puppetserver Errors

- [ ] Connection errors captured
- [ ] Authentication errors captured
- [ ] Compilation errors captured
- [ ] Certificate errors captured

### Bolt Errors

- [ ] Connection errors captured
- [ ] Task execution errors captured
- [ ] Command execution errors captured
- [ ] Inventory errors captured

### Hiera Errors

- [ ] File system errors captured
- [ ] Parsing errors captured
- [ ] Resolution errors captured
- [ ] Lookup errors captured

## Spot Testing (Sample Routes)

Perform detailed manual testing on sample routes:

### Sample 1: Inventory Route

- [ ] Test with valid node
- [ ] Test with invalid node
- [ ] Test with connection error
- [ ] Verify debug info completeness

### Sample 2: PuppetDB Route

- [ ] Test with valid query
- [ ] Test with invalid query
- [ ] Test with connection error
- [ ] Verify external API error capture

### Sample 3: Task Execution Route

- [ ] Test with valid task
- [ ] Test with invalid task
- [ ] Test with execution error
- [ ] Verify Bolt error capture

## Interactive Testing

- [ ] Run interactive tester: `./test-single-route.sh`
- [ ] Test at least 3 different routes
- [ ] Verify colored output is readable
- [ ] Verify debug info summary is accurate

## Documentation Review

- [ ] Review `manual-testing-guide.md`
- [ ] Review `manual-testing-quick-reference.md`
- [ ] Review `TESTING_README.md`
- [ ] All documentation is clear and accurate

## Issues Found

### Issue 1

**Route**: _______________  
**Description**: _______________  
**Severity**: [ ] Critical [ ] High [ ] Medium [ ] Low  
**Expected**: _______________  
**Actual**: _______________  
**Notes**: _______________

### Issue 2

**Route**: _______________  
**Description**: _______________  
**Severity**: [ ] Critical [ ] High [ ] Medium [ ] Low  
**Expected**: _______________  
**Actual**: _______________  
**Notes**: _______________

### Issue 3

**Route**: _______________  
**Description**: _______________  
**Severity**: [ ] Critical [ ] High [ ] Medium [ ] Low  
**Expected**: _______________  
**Actual**: _______________  
**Notes**: _______________

## Summary

**Total Routes Tested**: _____ / 58  
**Routes Passed**: _____  
**Routes Failed**: _____  
**Critical Issues**: _____  
**High Priority Issues**: _____  
**Medium Priority Issues**: _____  
**Low Priority Issues**: _____

## Sign-Off

**Testing Complete**: [ ] Yes [ ] No  
**All Critical Issues Resolved**: [ ] Yes [ ] No [ ] N/A  
**Ready for Next Phase**: [ ] Yes [ ] No  

**Tester Signature**: _______________  
**Date**: _______________

**Reviewer Signature**: _______________  
**Date**: _______________

## Next Steps

- [ ] Document all issues in GitHub
- [ ] Update tasks.md to mark task complete
- [ ] Proceed to next verification task
- [ ] Share results with team

## Notes

_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________
