<!-- CDK Best Practices adopted from https://github.com/mbonig/kiro-steering-docs/blob/main/cdk/cdk-best-practices.md -->
---
title: CDK Best Practices
inclusion: always
---

# CDK Best Practices

## Basics
- Use projen for project initialization and file management
- Use the latest version of the CDK, found here: https://github.com/aws/aws-cdk/releases
- Use cdk-iam-floyd for IAM policy generation
- Additional CDK apps should have a projen task with a prefix `cdk:`. E.g. `cdk:iam-roles`

## Structure
- All files in the `src/**` directory
- Applications in the `src/` directory
- Stacks in the `src/stacks/**` directory
- Constructs in the `src/constructs/**` directory
- Stages in the `src/stages/**` directory
- Lambda function handlers in a sub-directory of the defining construct, called `handler`
- Pascal-casing for filenames (e.g. `SomeConstruct.ts`)
- Each custom construct should reside in its own file named the same as the construct

## Apps
- SHOULD contain distinct stack/stage instances for each environment
- SHOULD provide each stack/stage with account/region specific values
- Context SHOULD NOT be used for anything, at all

## Stacks
- SHOULD be responsible for importing resources (`Vpc.fromLookup()`, `Bucket.fromBucketName()`, etc.)
- SHOULD be responsible for instantiating constructs

## Constructs
- SHOULD save the incoming constructor props as a private field
- SHOULD create all resources in protected methods, not in the constructor
- SHOULD NOT import resources (e.g. `Vpc.fromLookup()`)
- SHOULD be passed concrete objects representing resources
- Properties representing resource identifiers should use template literal types (e.g. `vpc-${string}`)

## Tests
- All tests in the `test/` directory
- Tests should match construct names (e.g. `SomeConstruct.test.ts`)
- Use fine-grained assertions for constructs
- Use snapshot tests for stacks
- Mock `Code.fromAsset` and `ContainerImage.fromAsset` calls

## Lambda Functions
- Use `NodejsFunction` or `PythonFunction` whenever possible