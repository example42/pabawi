# Certificate API Auth.conf Fix

## Issue

The Puppetserver certificate API was returning 403 Forbidden errors even with correct authentication because the auth.conf path pattern didn't match the API endpoint.

## Root Cause

The default Puppetserver `auth.conf` file has a path pattern like:

```hocon
match-request: {
    path: "/puppet-ca/v1/certificate_statuses/"
    type: "path"
    method: "get"
}
```

This pattern with `type: "path"` requires an EXACT match including the trailing slash. However, the correct Puppetserver API endpoint is `/puppet-ca/v1/certificate_statuses` (WITHOUT trailing slash).

## Fix

The auth.conf needs to be updated to use a regex pattern instead of exact path matching:

```hocon
match-request: {
    path: "^/puppet-ca/v1/certificate_statuses"
    type: "regex"
    method: [get, post, put, delete]
}
```

This regex pattern matches both:

- `/puppet-ca/v1/certificate_statuses` (list all certificates)
- `/puppet-ca/v1/certificate_statuses?state=signed` (with query params)

## Correct API Endpoint

The correct endpoint is: `/puppet-ca/v1/certificate_statuses` (NO trailing slash)

## Testing

To verify the fix works:

```bash
cd backend
npx tsx test-certificate-api-verification.ts
```

Expected result: API call should succeed and return certificate list.

## Related Documentation

- `backend/docs/puppetserver-certificate-api-fix.md` - Previous fixes for port and SSL configuration
- `backend/docs/task-5-certificate-api-verification.md` - Detailed verification logs

## Correct Auth.conf Configuration

Update your Puppetserver's auth.conf (typically at `/etc/puppetlabs/puppetserver/conf.d/auth.conf`):

```hocon
authorization: {
    version: 1
    rules: [
        {
            match-request: {
                path: "^/puppet-ca/v1/certificate_statuses"
                type: "regex"
                method: [get, post, put, delete]
            }
            allow: ["your-cert-name"]
            sort-order: 200
            name: "certificate access"
        }
    ]
}
```

**Important**:

- Use `type: "regex"` not `type: "path"`
- Use regex pattern `^/puppet-ca/v1/certificate_statuses` (no trailing slash)
- This matches both the base endpoint and endpoints with query parameters

After updating auth.conf, restart Puppetserver:

```bash
sudo systemctl restart puppetserver
```
