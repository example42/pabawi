/**
 * Tests for AWS API client functions
 *
 * Validates Requirements: 10.1, 13.1-13.7
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAWSRegions,
  getAWSInstanceTypes,
  getAWSAMIs,
  getAWSVPCs,
  getAWSSubnets,
  getAWSSecurityGroups,
  getAWSKeyPairs,
  provisionAWSInstance,
  executeAWSLifecycle,
} from './api';

// Mock fetch globally
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  vi.stubGlobal('performance', { now: () => 0 });
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockJsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as unknown as Response;
}

describe('AWS API Client - getAWSRegions', () => {
  it('returns regions array from API response', async () => {
    const regions = ['us-east-1', 'us-west-2', 'eu-west-1'];
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ regions }));

    const result = await getAWSRegions();

    expect(result).toEqual(regions);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/integrations/aws/regions',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('AWS API Client - getAWSInstanceTypes', () => {
  it('passes region as query parameter', async () => {
    const instanceTypes = [
      { instanceType: 't3.micro', vCpus: 2, memoryMiB: 1024, architecture: 'x86_64', currentGeneration: true },
    ];
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ instanceTypes }));

    const result = await getAWSInstanceTypes('us-east-1');

    expect(result).toEqual(instanceTypes);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/integrations/aws/instance-types?region=us-east-1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('omits region param when not provided', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ instanceTypes: [] }));

    await getAWSInstanceTypes();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/integrations/aws/instance-types',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('AWS API Client - getAWSAMIs', () => {
  it('passes region as required query parameter', async () => {
    const amis = [
      { imageId: 'ami-123', name: 'Amazon Linux 2', architecture: 'x86_64', ownerId: '123', state: 'available' },
    ];
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ amis }));

    const result = await getAWSAMIs('us-east-1');

    expect(result).toEqual(amis);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/integrations/aws/amis?region=us-east-1',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('AWS API Client - getAWSVPCs', () => {
  it('returns VPCs for a region', async () => {
    const vpcs = [
      { vpcId: 'vpc-123', cidrBlock: '10.0.0.0/16', state: 'available', isDefault: true, tags: {} },
    ];
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ vpcs }));

    const result = await getAWSVPCs('us-east-1');

    expect(result).toEqual(vpcs);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/integrations/aws/vpcs?region=us-east-1',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('AWS API Client - getAWSSubnets', () => {
  it('passes region and vpcId as query parameters', async () => {
    const subnets = [
      { subnetId: 'subnet-123', vpcId: 'vpc-123', cidrBlock: '10.0.1.0/24', availabilityZone: 'us-east-1a', availableIpAddressCount: 250, tags: {} },
    ];
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ subnets }));

    const result = await getAWSSubnets('us-east-1', 'vpc-123');

    expect(result).toEqual(subnets);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/integrations/aws/subnets?region=us-east-1&vpcId=vpc-123',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('omits vpcId when not provided', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ subnets: [] }));

    await getAWSSubnets('us-east-1');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/integrations/aws/subnets?region=us-east-1',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('AWS API Client - getAWSSecurityGroups', () => {
  it('passes region and vpcId as query parameters', async () => {
    const securityGroups = [
      { groupId: 'sg-123', groupName: 'default', description: 'Default SG', vpcId: 'vpc-123', tags: {} },
    ];
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ securityGroups }));

    const result = await getAWSSecurityGroups('us-east-1', 'vpc-123');

    expect(result).toEqual(securityGroups);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/integrations/aws/security-groups?region=us-east-1&vpcId=vpc-123',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('AWS API Client - getAWSKeyPairs', () => {
  it('returns key pairs for a region', async () => {
    const keyPairs = [
      { keyName: 'my-key', keyPairId: 'key-123', keyFingerprint: 'ab:cd:ef', keyType: 'rsa' },
    ];
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ keyPairs }));

    const result = await getAWSKeyPairs('us-east-1');

    expect(result).toEqual(keyPairs);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/integrations/aws/key-pairs?region=us-east-1',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('AWS API Client - provisionAWSInstance', () => {
  it('sends POST with provision parameters', async () => {
    const result = { status: 'success', output: { instanceId: 'i-abc123' } };
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ result }));

    const response = await provisionAWSInstance({
      imageId: 'ami-123',
      instanceType: 't3.micro',
      region: 'us-east-1',
      name: 'test-instance',
    });

    expect(response.result.status).toBe('success');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/integrations/aws/provision',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"imageId":"ami-123"'),
      }),
    );
  });
});

describe('AWS API Client - executeAWSLifecycle', () => {
  it('sends POST with lifecycle action parameters', async () => {
    const result = { status: 'success' };
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ result }));

    const response = await executeAWSLifecycle({
      instanceId: 'i-abc123',
      action: 'stop',
      region: 'us-east-1',
    });

    expect(response.result.status).toBe('success');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/integrations/aws/lifecycle',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"action":"stop"'),
      }),
    );
  });
});
