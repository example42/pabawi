/**
 * HieraParser Unit Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { HieraParser } from "../../src/integrations/hiera/HieraParser";
import type { Facts, HieraConfig } from "../../src/integrations/hiera/types";

describe("HieraParser", () => {
  let parser: HieraParser;

  beforeEach(() => {
    parser = new HieraParser("/tmp/test-control-repo");
  });

  describe("parseContent", () => {
    it("should parse a valid Hiera 5 configuration", () => {
      const content = `
version: 5
defaults:
  datadir: data
  data_hash: yaml_data
hierarchy:
  - name: "Per-node data"
    path: "nodes/%{facts.networking.fqdn}.yaml"
  - name: "Per-OS defaults"
    path: "os/%{facts.os.family}.yaml"
  - name: "Common data"
    path: "common.yaml"
`;

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.config?.version).toBe(5);
      expect(result.config?.hierarchy).toHaveLength(3);
      expect(result.config?.hierarchy[0].name).toBe("Per-node data");
      expect(result.config?.hierarchy[0].path).toBe("nodes/%{facts.networking.fqdn}.yaml");
      expect(result.config?.defaults?.datadir).toBe("data");
      expect(result.config?.defaults?.data_hash).toBe("yaml_data");
    });

    it("should parse hierarchy with multiple paths", () => {
      const content = `
version: 5
hierarchy:
  - name: "Multiple paths"
    paths:
      - "nodes/%{facts.networking.fqdn}.yaml"
      - "nodes/%{facts.networking.hostname}.yaml"
`;

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config?.hierarchy[0].paths).toEqual([
        "nodes/%{facts.networking.fqdn}.yaml",
        "nodes/%{facts.networking.hostname}.yaml",
      ]);
    });


    it("should parse hierarchy with glob patterns", () => {
      const content = `
version: 5
hierarchy:
  - name: "Glob pattern"
    glob: "nodes/*.yaml"
  - name: "Multiple globs"
    globs:
      - "environments/*.yaml"
      - "roles/*.yaml"
`;

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config?.hierarchy[0].glob).toBe("nodes/*.yaml");
      expect(result.config?.hierarchy[1].globs).toEqual([
        "environments/*.yaml",
        "roles/*.yaml",
      ]);
    });

    it("should parse hierarchy with mapped_paths", () => {
      const content = `
version: 5
hierarchy:
  - name: "Mapped paths"
    mapped_paths:
      - "facts.networking.interfaces"
      - "interface"
      - "interfaces/%{interface}.yaml"
`;

      const result = parser.parseContent(content);

      expect(result.success).toBe(true);
      expect(result.config?.hierarchy[0].mapped_paths).toEqual([
        "facts.networking.interfaces",
        "interface",
        "interfaces/%{interface}.yaml",
      ]);
    });

    it("should detect yaml backend", () => {
      const content = `
version: 5
defaults:
  data_hash: yaml_data
hierarchy:
  - name: "Common"
    path: "common.yaml"
`;

      const result = parser.parseContent(content);
      expect(result.success).toBe(true);

      const backend = parser.detectBackend(result.config!.hierarchy[0], result.config!.defaults);
      expect(backend.type).toBe("yaml");
    });

    it("should detect json backend", () => {
      const content = `
version: 5
hierarchy:
  - name: "JSON data"
    path: "common.json"
    data_hash: json_data
`;

      const result = parser.parseContent(content);
      expect(result.success).toBe(true);

      const backend = parser.detectBackend(result.config!.hierarchy[0]);
      expect(backend.type).toBe("json");
    });

    it("should detect eyaml backend", () => {
      const content = `
version: 5
hierarchy:
  - name: "Encrypted data"
    path: "secrets.eyaml"
    lookup_key: eyaml_lookup_key
`;

      const result = parser.parseContent(content);
      expect(result.success).toBe(true);

      const backend = parser.detectBackend(result.config!.hierarchy[0]);
      expect(backend.type).toBe("eyaml");
    });
  });


  describe("error handling", () => {
    it("should return error for invalid YAML syntax", () => {
      const content = `
version: 5
hierarchy:
  - name: "Bad YAML
    path: unclosed quote
`;

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("HIERA_PARSE_ERROR");
      expect(result.error?.message).toContain("YAML syntax error");
    });

    it("should return error for unsupported Hiera version", () => {
      const content = `
version: 3
hierarchy:
  - name: "Old version"
    path: "common.yaml"
`;

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("HIERA_PARSE_ERROR");
      expect(result.error?.message).toContain("Unsupported Hiera version");
    });

    it("should return error for missing hierarchy", () => {
      const content = `
version: 5
`;

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("HIERA_PARSE_ERROR");
      expect(result.error?.message).toContain("hierarchy");
    });

    it("should return error for hierarchy level without name", () => {
      const content = `
version: 5
hierarchy:
  - path: "common.yaml"
`;

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("HIERA_PARSE_ERROR");
      expect(result.error?.message).toContain("name");
    });

    it("should return error for non-object config", () => {
      const content = `just a string`;

      const result = parser.parseContent(content);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("HIERA_PARSE_ERROR");
    });
  });


  describe("interpolatePath", () => {
    const facts: Facts = {
      nodeId: "node1.example.com",
      gatheredAt: new Date().toISOString(),
      facts: {
        networking: {
          fqdn: "node1.example.com",
          hostname: "node1",
        },
        os: {
          family: "RedHat",
          name: "CentOS",
        },
        hostname: "node1",
        environment: "production",
        trusted: {
          certname: "node1.example.com",
        },
      },
    };

    it("should interpolate facts.xxx syntax", () => {
      const template = "nodes/%{facts.networking.fqdn}.yaml";  // pragma: allowlist secret
      const result = parser.interpolatePath(template, facts);
      expect(result).toBe("nodes/node1.example.com.yaml");
    });

    it("should interpolate nested facts", () => {
      const template = "os/%{facts.os.family}/%{facts.os.name}.yaml";  // pragma: allowlist secret
      const result = parser.interpolatePath(template, facts);
      expect(result).toBe("os/RedHat/CentOS.yaml");
    });

    it("should interpolate legacy ::xxx syntax", () => {
      const template = "nodes/%{::hostname}.yaml";  // pragma: allowlist secret
      const result = parser.interpolatePath(template, facts);
      expect(result).toBe("nodes/node1.yaml");
    });

    it("should interpolate trusted.xxx syntax", () => {
      const template = "nodes/%{trusted.certname}.yaml";  // pragma: allowlist secret
      const result = parser.interpolatePath(template, facts);
      expect(result).toBe("nodes/node1.example.com.yaml");
    });

    it("should interpolate simple variable syntax", () => {
      const template = "environments/%{environment}.yaml";  // pragma: allowlist secret
      const result = parser.interpolatePath(template, facts);
      expect(result).toBe("environments/production.yaml");
    });

    it("should preserve unresolved variables", () => {
      const template = "nodes/%{facts.nonexistent}.yaml";  // pragma: allowlist secret
      const result = parser.interpolatePath(template, facts);
      expect(result).toBe("nodes/%{facts.nonexistent}.yaml");
    });

    it("should handle multiple variables in one path", () => {
      const template = "%{facts.os.family}/%{facts.networking.hostname}/%{environment}.yaml";  // pragma: allowlist secret
      const result = parser.interpolatePath(template, facts);
      expect(result).toBe("RedHat/node1/production.yaml");
    });
  });


  describe("parseLookupOptionsFromContent", () => {
    it("should parse lookup_options with merge strategies", () => {
      const content = `
lookup_options:
  profile::base::packages:
    merge: deep
  profile::nginx::config:
    merge: hash
  profile::users::list:
    merge: unique
`;

      const result = parser.parseLookupOptionsFromContent(content);

      expect(result.size).toBe(3);
      expect(result.get("profile::base::packages")?.merge).toBe("deep");
      expect(result.get("profile::nginx::config")?.merge).toBe("hash");
      expect(result.get("profile::users::list")?.merge).toBe("unique");
    });

    it("should parse lookup_options with convert_to", () => {
      const content = `
lookup_options:
  profile::packages:
    convert_to: Array
  profile::settings:
    convert_to: Hash
`;

      const result = parser.parseLookupOptionsFromContent(content);

      expect(result.get("profile::packages")?.convert_to).toBe("Array");
      expect(result.get("profile::settings")?.convert_to).toBe("Hash");
    });

    it("should parse lookup_options with knockout_prefix", () => {
      const content = `
lookup_options:
  profile::base::packages:
    merge: deep
    knockout_prefix: "--"
`;

      const result = parser.parseLookupOptionsFromContent(content);

      expect(result.get("profile::base::packages")?.merge).toBe("deep");
      expect(result.get("profile::base::packages")?.knockout_prefix).toBe("--");
    });

    it("should parse merge as object with strategy", () => {
      const content = `
lookup_options:
  profile::config:
    merge:
      strategy: deep
`;

      const result = parser.parseLookupOptionsFromContent(content);

      expect(result.get("profile::config")?.merge).toBe("deep");
    });

    it("should return empty map for content without lookup_options", () => {
      const content = `
profile::nginx::port: 8080
profile::nginx::workers: 4
`;

      const result = parser.parseLookupOptionsFromContent(content);

      expect(result.size).toBe(0);
    });

    it("should return empty map for invalid YAML", () => {
      const content = `invalid: yaml: content:`;

      const result = parser.parseLookupOptionsFromContent(content);

      expect(result.size).toBe(0);
    });
  });


  describe("validateConfig", () => {
    it("should validate a correct configuration", () => {
      const config: HieraConfig = {
        version: 5,
        defaults: {
          datadir: "data",
          data_hash: "yaml_data",
        },
        hierarchy: [
          {
            name: "Common",
            path: "common.yaml",
          },
        ],
      };

      const result = parser.validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should warn about hierarchy level without path", () => {
      const config: HieraConfig = {
        version: 5,
        hierarchy: [
          {
            name: "No path",
          },
        ],
      };

      const result = parser.validateConfig(config);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes("No path"))).toBe(true);
    });

    it("should warn about hierarchy level without data provider", () => {
      const config: HieraConfig = {
        version: 5,
        hierarchy: [
          {
            name: "No provider",
            path: "common.yaml",
          },
        ],
      };

      const result = parser.validateConfig(config);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes("No provider"))).toBe(true);
    });
  });

  describe("expandHierarchyPaths", () => {
    const facts: Facts = {
      nodeId: "web1.example.com",
      gatheredAt: new Date().toISOString(),
      facts: {
        networking: {
          fqdn: "web1.example.com",
        },
        os: {
          family: "Debian",
        },
      },
    };

    it("should expand paths with fact interpolation", () => {
      const config: HieraConfig = {
        version: 5,
        defaults: {
          datadir: "data",
        },
        hierarchy: [
          {
            name: "Per-node",
            path: "nodes/%{facts.networking.fqdn}.yaml",
          },
          {
            name: "Per-OS",
            path: "os/%{facts.os.family}.yaml",
          },
          {
            name: "Common",
            path: "common.yaml",
          },
        ],
      };

      const paths = parser.expandHierarchyPaths(config, facts);

      expect(paths).toContain("data/nodes/web1.example.com.yaml");
      expect(paths).toContain("data/os/Debian.yaml");
      expect(paths).toContain("data/common.yaml");
    });

    it("should use level-specific datadir", () => {
      const config: HieraConfig = {
        version: 5,
        defaults: {
          datadir: "data",
        },
        hierarchy: [
          {
            name: "Secrets",
            path: "secrets.yaml",
            datadir: "secrets",
          },
          {
            name: "Common",
            path: "common.yaml",
          },
        ],
      };

      const paths = parser.expandHierarchyPaths(config, facts);

      expect(paths).toContain("secrets/secrets.yaml");
      expect(paths).toContain("data/common.yaml");
    });
  });
});
