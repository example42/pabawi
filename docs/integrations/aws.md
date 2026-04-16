# AWS Integration

Pabawi connects to AWS to discover EC2 instances across regions, manage their lifecycle, and launch new instances.

## Prerequisites

- AWS account with EC2 access
- IAM credentials (access key, instance profile, or assumed role)
- `sts:GetCallerIdentity` permission for health checks

## Configuration

```bash
AWS_ENABLED=true
AWS_DEFAULT_REGION=us-east-1
AWS_REGIONS='["us-east-1","eu-west-1"]'   # JSON array — multi-region inventory

# Credentials (omit to use AWS SDK default chain: env vars, ~/.aws/credentials, instance profile)
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# Optional
AWS_PROFILE=my-profile        # AWS CLI profile
AWS_SESSION_TOKEN=...         # STS temporary credentials
AWS_ENDPOINT=http://localhost:4566  # LocalStack or custom endpoint
```

See [configuration.md](../configuration.md) for all AWS env vars.

## Authentication

**IAM user (simple setups):** Create a dedicated IAM user with programmatic access and the policy below.

**Instance profile (EC2-hosted Pabawi):** No credentials needed — the SDK picks them up automatically.

**Assumed role:** Set credentials via `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` from an STS `AssumeRole` call.

### Required IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "ec2:DescribeInstances",
      "ec2:DescribeRegions",
      "ec2:DescribeInstanceTypes",
      "ec2:DescribeImages",
      "ec2:DescribeVpcs",
      "ec2:DescribeSubnets",
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeKeyPairs",
      "ec2:RunInstances",
      "ec2:StartInstances",
      "ec2:StopInstances",
      "ec2:RebootInstances",
      "ec2:TerminateInstances",
      "sts:GetCallerIdentity"
    ],
    "Resource": "*"
  }]
}
```

Remove `ec2:TerminateInstances` if you want to enforce `ALLOW_DESTRUCTIVE_PROVISIONING=false` at the IAM level as well.

## What It Provides

| Feature | Details |
|---|---|
| **Inventory** | EC2 instances across all configured regions |
| **Grouping** | By region, by VPC, by tag |
| **Facts** | Instance type, AMI, state, IP, tags, launch time |
| **Lifecycle** | Start, stop, reboot |
| **Launch** | Launch new EC2 instance with AMI, instance type, subnet, security group, key pair |
| **Terminate** | Permanently delete — blocked unless `ALLOW_DESTRUCTIVE_PROVISIONING=true` |

## Troubleshooting

| Problem | Fix |
|---|---|
| "Failed to validate AWS credentials" | Check `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, or verify instance profile is attached |
| "AccessDenied" | IAM user/role missing required permissions. Check the policy above. |
| No instances in inventory | Check `AWS_REGIONS`. Instances must be in a listed region. |
| "Terminate blocked (403 DESTRUCTIVE_ACTION_DISABLED)" | Set `ALLOW_DESTRUCTIVE_PROVISIONING=true` |
| Multi-region discovery fails for one region | A regional endpoint error won't block other regions. Check backend logs for per-region errors. |
