# PuppetServer CA Authorization Issue

## Problem

Certificate management page shows "Showing 0 certificates" because the `pabawi` certificate is not authorized to access Puppet CA API endpoints.

## Root Cause

PuppetServer log shows:

```
Forbidden request: pabawi(100.68.9.95) access to /puppet-ca/v1/certificate_status/any_key (method :get) (authenticated: true) denied by rule 'puppetlabs certificate status'.
```

The certificate authenticates successfully but lacks authorization to access CA endpoints.

## Solution

The `pabawi` certificate needs to be added to the Puppet Enterprise RBAC system or the auth.conf file to grant access to CA operations.

### Option 1: RBAC (Recommended for PE)

1. Log into Puppet Enterprise Console
2. Navigate to Access Control > Users
3. Create or find the user associated with the `pabawi` certificate
4. Assign the "Certificate Manager" role or create a custom role with CA permissions

### Option 2: auth.conf (Legacy method)

Add the following rule to `/etc/puppetlabs/puppetserver/conf.d/auth.conf`:

```hocon
authorization: {
    version: 1
    rules: [
        {
            match-request: {
                path: "^/puppet-ca/v1/"
                type: regex
                method: [get, post, put, delete]
            }
            allow: ["pabawi"]
            sort-order: 200
            name: "pabawi certificate access"
        }
    ]
}
```

### Option 3: Certificate whitelist

Add the certificate subject to the CA whitelist in the PuppetServer configuration.

## Testing

After applying the fix, test with:

```bash
curl -k --cert /Users/al/lab42-bolt/pabawi-cert.pem --key /Users/al/lab42-bolt/pabawi-key.pem --cacert /Users/al/lab42-bolt/ca.pem https://puppet.office.lab42:8140/puppet-ca/v1/certificate_status/any_key
```

Should return certificate data instead of "Forbidden".

## Impact

- Certificate management page will show certificates
- All CA operations (sign, revoke, list) will work
- PuppetServer integration will be fully functional
