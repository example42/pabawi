import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { YamlConfigLoader } from "../../src/config/YamlConfigLoader";

// Mock fs module
vi.mock("fs");

// Mock LoggerService
vi.mock("../../src/services/LoggerService", () => ({
  LoggerService: class MockLoggerService {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

describe("YamlConfigLoader", () => {
  const mockEnv: Record<string, string | undefined> = {
    TEST_VAR: "test-value",
    PUPPETDB_URL: "https://puppetdb.example.com",
    EMPTY_VAR: "",
  };

  let loader: YamlConfigLoader;

  beforeEach(() => {
    vi.clearAllMocks();
    loader = new YamlConfigLoader("/test/base", mockEnv);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("loadFile", () => {
    it("should return error when file does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = loader.loadFile("config.yaml");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should load and parse a valid YAML file", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
integrations:
  bolt:
    enabled: true
    config:
      timeout: 30000
`);

      const result = loader.loadFile("config.yaml");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        integrations: {
          bolt: {
            enabled: true,
            config: {
              timeout: 30000,
            },
          },
        },
      });
    });

    it("should handle empty YAML file", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("");

      const result = loader.loadFile("config.yaml");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it("should handle YAML parse errors", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
invalid: yaml:
  - missing: quotes
  broken
`);

      const result = loader.loadFile("config.yaml");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to parse");
    });
  });

  describe("environment variable interpolation", () => {
    it("should interpolate simple environment variables", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
config:
  url: \${TEST_VAR}
`);

      const result = loader.loadFile("config.yaml");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        config: {
          url: "test-value",
        },
      });
    });

    it("should use default value when variable is not set", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
config:
  timeout: \${MISSING_VAR:-30000}
`);

      const result = loader.loadFile("config.yaml");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        config: {
          timeout: "30000",
        },
      });
    });

    it("should use default value when variable is empty", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
config:
  value: \${EMPTY_VAR:-default}
`);

      const result = loader.loadFile("config.yaml");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        config: {
          value: "default",
        },
      });
    });

    it("should throw error with custom message when using :? operator", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
config:
  secret: \${MISSING_SECRET:?Secret must be provided}
`);

      const result = loader.loadFile("config.yaml");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Secret must be provided");
    });

    it("should keep placeholder when required variable is missing", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
config:
  url: \${MISSING_URL}
`);

      const result = loader.loadFile("config.yaml");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        config: {
          url: "${MISSING_URL}",
        },
      });
    });

    it("should interpolate variables in arrays", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
config:
  urls:
    - \${PUPPETDB_URL}
    - https://backup.example.com
`);

      const result = loader.loadFile("config.yaml");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        config: {
          urls: ["https://puppetdb.example.com", "https://backup.example.com"],
        },
      });
    });

    it("should interpolate multiple variables in same string", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
config:
  connection: "\${PUPPETDB_URL}/\${TEST_VAR}"
`);

      const result = loader.loadFile("config.yaml");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        config: {
          connection: "https://puppetdb.example.com/test-value",
        },
      });
    });
  });

  describe("loadFileOrEmpty", () => {
    it("should return empty object when file does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = loader.loadFileOrEmpty("missing.yaml");

      expect(result).toEqual({});
    });

    it("should return parsed content when file exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("key: value");

      const result = loader.loadFileOrEmpty("exists.yaml");

      expect(result).toEqual({ key: "value" });
    });
  });

  describe("loadFirst", () => {
    it("should load first existing file", () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        return String(filePath).includes("second.yaml");
      });
      vi.mocked(fs.readFileSync).mockReturnValue("found: true");

      const result = loader.loadFirst(
        "first.yaml",
        "second.yaml",
        "third.yaml",
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ found: true });
    });

    it("should return error when no files exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = loader.loadFirst("a.yaml", "b.yaml", "c.yaml");

      expect(result.success).toBe(false);
      expect(result.error).toContain("No configuration file found");
    });
  });

  describe("loadAndMerge", () => {
    it("should merge multiple config files", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce("base:\n  timeout: 1000\n  retries: 3")
        .mockReturnValueOnce("base:\n  timeout: 2000\n  extra: true");

      const result = loader.loadAndMerge("base.yaml", "override.yaml");

      expect(result).toEqual({
        base: {
          timeout: 2000,
          retries: 3,
          extra: true,
        },
      });
    });

    it("should skip non-existent files during merge", () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      vi.mocked(fs.readFileSync).mockReturnValue("key: value");

      const result = loader.loadAndMerge("exists.yaml", "missing.yaml");

      expect(result).toEqual({ key: "value" });
    });
  });

  describe("fileExists", () => {
    it("should return true when file exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      expect(loader.fileExists("config.yaml")).toBe(true);
    });

    it("should return false when file does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(loader.fileExists("missing.yaml")).toBe(false);
    });
  });

  describe("getResolvedPath", () => {
    it("should resolve relative path from base path", () => {
      const resolved = loader.getResolvedPath("config/app.yaml");

      expect(resolved).toBe(path.join("/test/base", "config/app.yaml"));
    });

    it("should keep absolute paths unchanged", () => {
      const resolved = loader.getResolvedPath("/absolute/path/config.yaml");

      expect(resolved).toBe("/absolute/path/config.yaml");
    });
  });

  describe("writeFile", () => {
    it("should write YAML content to file", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const writeFileSpy = vi.mocked(fs.writeFileSync);

      loader.writeFile("output.yaml", { key: "value" });

      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.stringContaining("output.yaml"),
        expect.stringContaining("key: value"),
        "utf-8",
      );
    });

    it("should create directory if it does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const mkdirSpy = vi.mocked(fs.mkdirSync);

      loader.writeFile("subdir/output.yaml", { key: "value" });

      expect(mkdirSpy).toHaveBeenCalledWith(expect.any(String), {
        recursive: true,
      });
    });

    it("should add comment header when provided", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const writeFileSpy = vi.mocked(fs.writeFileSync);

      loader.writeFile("output.yaml", { key: "value" }, "This is a comment");

      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("# This is a comment"),
        "utf-8",
      );
    });
  });
});
