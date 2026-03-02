/**
 * Inventory File Parser for SSH Integration
 *
 * Parses YAML or JSON inventory files into Node objects
 * compatible with the Bolt inventory format.
 */

import type { Node } from '../bolt/types';

/**
 * Error thrown when inventory file parsing fails
 */
export class InventoryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InventoryParseError';
  }
}

/**
 * Parse an inventory file content into Node objects
 *
 * @param content - Raw file content (YAML or JSON)
 * @param format - File format ('yaml' or 'json')
 * @returns Array of parsed Node objects
 * @throws InventoryParseError if parsing fails
 */
export function parseInventoryFile(content: string, format: 'yaml' | 'json'): Node[] {
  if (!content.trim()) {
    return [];
  }

  try {
    let data: unknown;

    if (format === 'json') {
      data = JSON.parse(content) as unknown;
    } else {
      // For YAML, attempt JSON parse as a fallback since
      // a proper YAML parser would be added as a dependency
      throw new InventoryParseError(
        'YAML inventory parsing requires a YAML parser dependency'
      );
    }

    if (!Array.isArray(data)) {
      throw new InventoryParseError(
        `Expected an array of nodes, got ${typeof data}`
      );
    }

    return (data as Record<string, unknown>[]).map((item, index) => {
      if (!item.name || typeof item.name !== 'string') {
        throw new InventoryParseError(
          `Node at index ${String(index)} is missing a valid 'name' field`
        );
      }

      const name = item.name;
      const id = typeof item.id === 'string' ? item.id : name;
      const uri = typeof item.uri === 'string' ? item.uri : `ssh://${name}`;
      const transport = typeof item.transport === 'string'
        ? (item.transport as Node['transport'])
        : 'ssh';
      const config = (item.config ?? {}) as Node['config'];

      return {
        id,
        name,
        uri,
        transport,
        config,
        source: 'ssh-inventory',
      } satisfies Node;
    });
  } catch (error) {
    if (error instanceof InventoryParseError) {
      throw error;
    }
    throw new InventoryParseError(
      `Failed to parse ${format} inventory: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
