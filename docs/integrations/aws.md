# AWS Integration

The AWS integration enables Pabawi to manage Amazon EC2 infrastructure, including instance provisioning, lifecycle management, and inventory discovery across AWS regions.

## Features

- **Inventory Discovery**: Automatically discover all EC2 instances across regions
- **Group Management**: Organize instances by region, VPC, and tags
- **Facts Retrieval**: Get detailed instance metadata and configuration
- **Lifecycle Actions**: Start, stop, reboot, and terminate EC2 instances
- **Provisioning**: Launch new EC2 instances with full parameter control
- **Health Monitoring**: Validate AWS credentials via STS GetCallerIdentity

## Configuration

### Environment Variables

All AWS configuration is done via environment variables in `backend/.env`. You can also use the **AWS Setup Guide** in the Pabawi web UI to generate the `.env` snippet — it walks you through the settings and lets you copy the result to your clipboard.

Add the following to your `backend/.env`:

```bash
# Required
AWS_ENABLED=true

# Credentials (optional — if omitted, the AWS SDK default credential chain is used)
# AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
# AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_DEFAULT_REGION=us-east-1

# Query multiple regions for inventory (JSON array or comma-separated)
# AWS_REGIONS=["us-east-1","eu-west-1","ap-southeast-1"]

# Optional: AWS CLI profile name
# AWS_PROFILE=default

# Optional: Session token for temporary credentials
# AWS_SESSION_TOKEN=your_session_token_here
```

### Configuration Options

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AWS_ENABLED` | Yes | `false` | Enable AWS integration |
| `AWS_ACCESS_KEY_ID` | No* | - | AWS access key ID |
| `AWS_SECRET_ACCESS_KEY` | No* | - | AWS secret access key |
| `AWS_DEFAULT_REGION` | No | `us-east-1` | Default AWS region |
| `AWS_REGIONS` | No | - | JSON array or comma-separated list of regions for inventory |
| `AWS_PROFILE` | No | - | AWS CLI profile name |
| `AWS_SESSION_TOKEN` | No | - | Session token for temporary credentials (STS) |
| `AWS_ENDPOINT` | No | - | Custom endpoint URL (for testing or VPC endpoints) |

*If no explicit credentials or profile are provided, the AWS SDK default credential chain is used (environment variables, `~/.aws/credentials`, instance profile, etc.).

## Authentication

### IAM User with Access Keys (Recommended for Development)

Create a dedicated IAM user with programmatic access.

#### Creating an IAM User

1. Open the AWS IAM Console
2. Navigate to **Users → Add users**
3. Enter a username (e.g., `pabawi-ec2`)
4. Select **Access key - Programmatic access**
5. Attach the required policy (see below)
6. Copy the Access Key ID and Secret Access Key

#### Required IAM Permissions

Grant the following permissions to the IAM user:

- `ec2:RunInstances` — Launch new instances
- `ec2:DescribeInstances` — List and inspect instances
- `ec2:StartInstances` — Start stopped instances
- `ec2:StopInstances` — Stop running instances
- `ec2:RebootInstances` — Reboot instances
- `ec2:TerminateInstances` — Terminate instances
- `ec2:DescribeRegions` — List available regions
- `ec2:DescribeInstanceTypes` — List instance types
- `ec2:DescribeImages` — List AMIs
- `ec2:DescribeVpcs` — List VPCs
- `ec2:DescribeSubnets` — List subnets
- `ec2:DescribeSecurityGroups` — List security groups
- `ec2:DescribeKeyPairs` — List key pairs
- `sts:GetCallerIdentity` — Health check validation

#### Minimal IAM Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:RunInstances",
        "ec2:DescribeInstances",
        "ec2:StartInstances",
        "ec2:StopInstances",
        "ec2:RebootInstances",
        "ec2:TerminateInstances",
        "ec2:DescribeRegions",
        "ec2:DescribeInstanceTypes",
        "ec2:DescribeImages",
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeKeyPairs"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "sts:GetCallerIdentity",
      "Resource": "*"
    }
  ]
}
```

### Temporary Credentials (STS)

For enhanced security, use temporary credentials from AWS STS:

```bash
AWS_ACCESS_KEY_ID=ASIATEMP...
AWS_SECRET_ACCESS_KEY=tempSecret...
AWS_SESSION_TOKEN=FwoGZXIvYXdzE...
```

**Note**: Temporary credentials expire. The integration does not automatically refresh them.

### AWS CLI Profile

You can use a named profile from your `~/.aws/credentials` and `~/.aws/config` files:

```bash
AWS_ENABLED=true
AWS_PROFILE=my-profile
```

When `AWS_PROFILE` is set, the AWS SDK reads credentials and region from the corresponding profile in your AWS config files. This is useful when you manage multiple AWS accounts or use SSO.

**Note**: `AWS_PROFILE` is passed to the AWS SDK via the process environment (loaded by dotenv). Pabawi does not read the profile files directly — the SDK handles credential resolution.

### Default Credential Chain

If no explicit credentials (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`) or profile (`AWS_PROFILE`) are configured, the AWS SDK automatically resolves credentials using its default credential provider chain, in this order:

1. Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`)
2. Shared credentials file (`~/.aws/credentials`)
3. AWS config file (`~/.aws/config`)
4. ECS container credentials (if running in ECS)
5. EC2 instance metadata / IAM role (if running on EC2)

This means `AWS_ENABLED=true` with no other AWS settings will work if your environment already has credentials configured through any of these mechanisms.

## Inventory Discovery

The AWS integration discovers all EC2 instances across the configured regions. If `AWS_REGIONS` is set, all listed regions are queried in parallel. Otherwise, only the default region (`AWS_DEFAULT_REGION` or `us-east-1`) is queried.

### Node Format

Each discovered instance is represented as a Node:

```typescript
{
  id: 'aws:us-east-1:i-0123456789abcdef0',
  name: 'my-instance',
  status: 'running' | 'stopped' | 'pending' | 'terminated',
  ip: '10.0.1.100',
  metadata: {
    instanceType: 't3.micro',
    region: 'us-east-1',
    vpcId: 'vpc-abc123',
    tags: { Name: 'my-instance', Environment: 'production' },
    source: 'aws'
  }
}
```

### Groups

Instances are automatically organized into groups:

- **By Region**: `aws:region:us-east-1` — All instances in a region
- **By VPC**: `aws:vpc:vpc-abc123` — All instances in a VPC
- **By Tag**: `aws:tag:Environment:production` — Instances matching a tag

## Lifecycle Actions

### Supported Actions

| Action | Description |
|--------|-------------|
| `start` | Start a stopped instance |
| `stop` | Stop a running instance |
| `reboot` | Reboot a running instance |
| `terminate` | Permanently terminate an instance |

### Action Examples

#### Start an Instance

```typescript
const result = await integrationManager.executeAction({
  type: 'lifecycle',
  target: 'aws:us-east-1:i-0123456789abcdef0',
  action: 'start',
  parameters: {}
});
```

#### Terminate an Instance

```typescript
const result = await integrationManager.executeAction({
  type: 'lifecycle',
  target: 'aws:us-east-1:i-0123456789abcdef0',
  action: 'terminate',
  parameters: {}
});
```

### Action Results

All actions return an `ExecutionResult`:

```typescript
{
  success: true,
  output: 'Instance started successfully',
  metadata: {
    instanceId: 'i-0123456789abcdef0',
    region: 'us-east-1'
  }
}
```

## Provisioning

### Launch an EC2 Instance

```typescript
const result = await integrationManager.executeAction({
  type: 'provision',
  action: 'provision',
  parameters: {
    imageId: 'ami-0abcdef1234567890',
    instanceType: 't3.micro',
    keyName: 'my-key-pair',
    securityGroupIds: ['sg-0123456789abcdef0'],
    subnetId: 'subnet-0123456789abcdef0',
    region: 'us-east-1',
    name: 'my-new-instance'
  }
});
```

#### Provisioning Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `imageId` | string | Yes | - | AMI ID to launch |
| `instanceType` | string | No | t3.micro | EC2 instance type |
| `keyName` | string | No | - | SSH key pair name |
| `securityGroupIds` | string[] | No | - | Security group IDs |
| `subnetId` | string | No | - | Subnet ID for VPC placement |
| `region` | string | No | default | AWS region to launch in |
| `name` | string | No | - | Instance name tag |

## Resource Discovery

The integration provides endpoints to discover AWS resources for provisioning:

| Endpoint | Description |
|----------|-------------|
| `GET /api/integrations/aws/regions` | List available AWS regions |
| `GET /api/integrations/aws/instance-types` | List EC2 instance types |
| `GET /api/integrations/aws/amis?region=` | List AMIs by region |
| `GET /api/integrations/aws/vpcs?region=` | List VPCs by region |
| `GET /api/integrations/aws/subnets?region=` | List subnets by region |
| `GET /api/integrations/aws/security-groups?region=` | List security groups by region |
| `GET /api/integrations/aws/key-pairs?region=` | List key pairs by region |

## Health Monitoring

Check the health of the AWS integration:

```typescript
const health = await integrationManager.healthCheckAll();
const awsHealth = health.get('aws');

console.log(awsHealth);
// {
//   healthy: true,
//   message: 'AWS credentials valid',
//   details: { account: '123456789012', arn: 'arn:aws:iam::...' },
//   lastCheck: 1234567890
// }
```

### Health States

- **Healthy**: STS GetCallerIdentity succeeds, credentials are valid
- **Unhealthy**: Authentication failed or API unreachable

The plugin continues accepting configuration updates when unhealthy.

## Error Handling

### Error Types

- `AWSAuthenticationError` — Invalid or expired credentials (401/403)
- General API errors — Network issues, rate limiting, service errors

### Common Errors

#### InvalidClientTokenId

```
AWSAuthenticationError: AWS authentication failed
```

**Solution**: Verify your Access Key ID is correct and the IAM user is active.

#### SignatureDoesNotMatch

```
AWSAuthenticationError: AWS authentication failed
```

**Solution**: Verify your Secret Access Key is correct.

#### UnauthorizedOperation

```
AccessDenied: User is not authorized to perform ec2:RunInstances
```

**Solution**: Attach the required IAM policy to your user or role.

#### ExpiredToken

```
AWSAuthenticationError: AWS authentication failed
```

**Solution**: Refresh your temporary credentials (session token has expired).

## Troubleshooting

### Connection Issues

**Problem**: Cannot reach AWS API endpoints

**Solutions**:

1. Check network connectivity to AWS endpoints
2. Verify proxy settings if behind a corporate firewall
3. Ensure DNS resolution works for `ec2.{region}.amazonaws.com`
4. Test with AWS CLI: `aws sts get-caller-identity`

### Authentication Issues

**Problem**: Credentials are rejected

**Solutions**:

1. Verify Access Key ID and Secret Access Key are correct
2. Check the IAM user is not disabled or deleted
3. For temporary credentials, ensure the session token is still valid
4. Verify no restrictive IAM policies or SCPs are blocking access

### Permission Issues

**Problem**: Operations fail with access denied

**Solutions**:

1. Review the IAM policy attached to the user
2. Check for restrictive Service Control Policies (SCPs)
3. Verify the region is enabled in your AWS account
4. Review CloudTrail logs for detailed permission errors

### Region Issues

**Problem**: Resources not found or empty inventory

**Solutions**:

1. Verify the correct region is configured
2. Check that EC2 instances exist in the specified region
3. Ensure the region is enabled in your AWS account settings

## Best Practices

### Security

1. **Use Least Privilege**: Grant only the specific EC2 actions Pabawi needs
2. **Rotate Credentials**: Regularly rotate access keys
3. **Use Temporary Credentials**: Prefer STS temporary credentials over long-lived keys
4. **Store Securely**: Use `backend/.env` with restricted file permissions (`chmod 600`) and never commit it to version control
5. **Monitor Access**: Enable CloudTrail logging for API activity

### Performance

1. **Region Selection**: Configure the region closest to your Pabawi instance
2. **Resource Caching**: The integration caches inventory and resource discovery results

### Reliability

1. **Handle Errors**: Always check `ExecutionResult.success` before proceeding
2. **Health Checks**: Monitor integration health to detect credential expiration early
3. **Journal Events**: All provisioning and lifecycle actions are recorded in the journal

## API Reference

### Integration Methods

#### getInventory()

Returns all EC2 instances across the configured regions (queries all regions in parallel).

```typescript
const nodes = await awsPlugin.getInventory();
```

#### getGroups()

Returns groups organized by region, VPC, and tags.

```typescript
const groups = await awsPlugin.getGroups();
```

#### getNodeFacts(nodeId: string)

Returns detailed facts for a specific EC2 instance.

```typescript
const facts = await awsPlugin.getNodeFacts('aws:us-east-1:i-0123456789abcdef0');
```

#### executeAction(action: Action)

Executes a lifecycle or provisioning action.

```typescript
const result = await awsPlugin.executeAction({
  type: 'lifecycle',
  target: 'aws:us-east-1:i-0123456789abcdef0',
  action: 'start',
  parameters: {}
});
```

#### performHealthCheck()

Validates AWS credentials using STS GetCallerIdentity.

```typescript
const health = await awsPlugin.performHealthCheck();
```

#### getRegions()

Returns available AWS regions.

```typescript
const regions = await awsPlugin.getRegions();
```

#### getInstanceTypes(region?: string)

Returns available EC2 instance types.

```typescript
const types = await awsPlugin.getInstanceTypes('us-east-1');
```

#### getAMIs(region: string)

Returns available AMIs for a region.

```typescript
const amis = await awsPlugin.getAMIs('us-east-1');
```

#### getVPCs(region: string)

Returns VPCs for a region.

```typescript
const vpcs = await awsPlugin.getVPCs('us-east-1');
```

#### getSubnets(region: string, vpcId?: string)

Returns subnets for a region, optionally filtered by VPC.

```typescript
const subnets = await awsPlugin.getSubnets('us-east-1', 'vpc-abc123');
```

#### getSecurityGroups(region: string, vpcId?: string)

Returns security groups for a region, optionally filtered by VPC.

```typescript
const sgs = await awsPlugin.getSecurityGroups('us-east-1');
```

#### getKeyPairs(region: string)

Returns key pairs for a region.

```typescript
const keyPairs = await awsPlugin.getKeyPairs('us-east-1');
```

## Support

For issues, questions, or contributions:

- GitHub Issues: [pabawi/issues](https://github.com/pabawi/pabawi/issues)
- Documentation: [pabawi.dev/docs](https://pabawi.dev/docs)
- AWS EC2 Docs: [docs.aws.amazon.com/ec2](https://docs.aws.amazon.com/ec2/)
