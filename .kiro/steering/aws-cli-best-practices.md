---
title: AWS CLI Best Practices
inclusion: always
---

# AWS CLI Best Practices

## Pager Behavior
When running AWS CLI commands that might produce large outputs, always use the `--no-cli-pager` option to prevent interactive paging. This is especially important for:
- List operations (`aws s3 ls`, `aws ec2 describe-instances`, etc.)
- Commands that return large JSON responses
- Commands used in scripts or automation

Example:
```bash
aws amplify list-apps --profile da --no-cli-pager
aws ec2 describe-instances --no-cli-pager
aws s3 ls s3://my-bucket --no-cli-pager
```

## Output Formatting
- Use `--output json` for programmatic processing
- Use `--output table` for human-readable output
- Use `--query` to filter results and reduce output size

## Error Handling
- Always check exit codes in scripts
- Use `--debug` flag for troubleshooting
- Consider using `--dry-run` for testing destructive operations

## Security
- Use IAM roles instead of access keys when possible
- Rotate access keys regularly
- Use least privilege principle for IAM policies

## AWS Integration Best Practices
- Use AWS-Knowledge MCP server for current documentation and best practices
- Follow AWS Well-Architected Framework principles
- Reference official AWS documentation for implementation patterns
- Validate service usage against latest AWS documentation
- Use aws-api-mcp-server for programmatic AWS API interactions