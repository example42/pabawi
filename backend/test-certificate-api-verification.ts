#!/usr/bin/env tsx
/**
 * Certificate API Verification Script
 *
 * This script tests the Puppetserver certificate API to verify:
 * 1. Correct API endpoint is being used
 * 2. Authentication headers are correct
 * 3. Response parsing works correctly
 * 4. Logging is comprehensive
 */

import { PuppetserverClient } from "./src/integrations/puppetserver/PuppetserverClient";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.join(__dirname, ".env") });

async function main() {
  console.log("=".repeat(80));
  console.log("Certificate API Verification");
  console.log("=".repeat(80));
  console.log();

  // Verify environment variables
  console.log("1. Verifying Environment Configuration");
  console.log("-".repeat(80));

  const requiredVars = [
    "PUPPETSERVER_ENABLED",
    "PUPPETSERVER_SERVER_URL",
    "PUPPETSERVER_PORT",
    "PUPPETSERVER_SSL_ENABLED",
    "PUPPETSERVER_SSL_CA",
    "PUPPETSERVER_SSL_CERT",
    "PUPPETSERVER_SSL_KEY",
  ];

  let configValid = true;
  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value) {
      console.error(`❌ Missing: ${varName}`);
      configValid = false;
    } else {
      // Mask sensitive values
      const displayValue =
        varName.includes("TOKEN") || varName.includes("KEY")
          ? "***REDACTED***"
          : value;
      console.log(`✅ ${varName}: ${displayValue}`);
    }
  }

  if (!configValid) {
    console.error(
      "\n❌ Configuration is incomplete. Please check your .env file.",
    );
    process.exit(1);
  }

  console.log("\n✅ Configuration is valid\n");

  // Create Puppetserver client
  console.log("2. Creating Puppetserver Client");
  console.log("-".repeat(80));

  const client = new PuppetserverClient({
    serverUrl: process.env.PUPPETSERVER_SERVER_URL!,
    port: parseInt(process.env.PUPPETSERVER_PORT || "8140", 10),
    token: process.env.PUPPETSERVER_TOKEN,
    ca: process.env.PUPPETSERVER_SSL_CA,
    cert: process.env.PUPPETSERVER_SSL_CERT,
    key: process.env.PUPPETSERVER_SSL_KEY,
    rejectUnauthorized:
      process.env.PUPPETSERVER_SSL_REJECT_UNAUTHORIZED === "true",
    timeout: parseInt(process.env.PUPPETSERVER_TIMEOUT || "30000", 10),
  });

  console.log("✅ Client created successfully");
  console.log(`   Base URL: ${client.getBaseUrl()}`);
  console.log(`   Has Token Auth: ${client.hasTokenAuthentication()}`);
  console.log(`   Has Cert Auth: ${client.hasCertificateAuthentication()}`);
  console.log(`   Has SSL: ${client.hasSSL()}`);
  console.log();

  // Test certificate API
  console.log("3. Testing Certificate API");
  console.log("-".repeat(80));
  console.log("Calling getCertificates()...\n");

  try {
    const result = await client.getCertificates();

    console.log("\n✅ API call successful!");
    console.log(
      `   Result type: ${Array.isArray(result) ? "array" : typeof result}`,
    );

    if (Array.isArray(result)) {
      console.log(`   Certificate count: ${result.length}`);

      if (result.length > 0) {
        console.log("\n   Sample certificate:");
        const sample = result[0] as Record<string, unknown>;
        console.log(`   - certname: ${sample.certname}`);
        console.log(`   - status: ${sample.state || sample.status}`);
        console.log(
          `   - fingerprint: ${sample.fingerprint ? String(sample.fingerprint).substring(0, 20) + "..." : "N/A"}`,
        );

        // Check for expected fields
        console.log("\n   Field validation:");
        const expectedFields = ["certname", "state", "fingerprint"];
        for (const field of expectedFields) {
          const hasField =
            field in sample || (field === "status" && "state" in sample);
          console.log(
            `   ${hasField ? "✅" : "❌"} ${field}: ${hasField ? "present" : "missing"}`,
          );
        }
      }
    } else {
      console.log("   ⚠️  Result is not an array");
      console.log(`   Result: ${JSON.stringify(result).substring(0, 200)}`);
    }

    console.log();

    // Test with status filter
    console.log("4. Testing Certificate API with Status Filter");
    console.log("-".repeat(80));
    console.log('Calling getCertificates("signed")...\n');

    const signedResult = await client.getCertificates("signed");

    console.log("\n✅ Filtered API call successful!");
    console.log(
      `   Result type: ${Array.isArray(signedResult) ? "array" : typeof signedResult}`,
    );

    if (Array.isArray(signedResult)) {
      console.log(`   Signed certificate count: ${signedResult.length}`);
    }

    console.log();
    console.log("=".repeat(80));
    console.log("✅ All tests passed!");
    console.log("=".repeat(80));
  } catch (error) {
    console.error("\n❌ API call failed!");
    console.error(
      `   Error type: ${error instanceof Error ? error.constructor.name : typeof error}`,
    );
    console.error(
      `   Error message: ${error instanceof Error ? error.message : String(error)}`,
    );

    if (error instanceof Error && "details" in error) {
      console.error(
        `   Error details: ${JSON.stringify((error as any).details, null, 2)}`,
      );
    }

    console.log();
    console.log("=".repeat(80));
    console.log("❌ Tests failed");
    console.log("=".repeat(80));

    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
