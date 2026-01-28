#!/usr/bin/env node

/**
 * Debug script to test inventory API and node linking behavior
 *
 * This script will:
 * 1. Fetch the inventory from the API
 * 2. Check which sources each node appears in
 * 3. Identify nodes that should have multiple source tags
 * 4. Help debug the puppet.office.lab42 tagging issue
 */

const http = require('http');

// Configuration
const API_HOST = 'localhost';
const API_PORT = 3001; // Adjust if your backend runs on a different port
const API_PATH = '/api/inventory';

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

async function debugInventoryLinking() {
  try {
    console.log('🔍 Fetching inventory from API...');
    const response = await makeRequest(API_PATH);

    console.log('\n📊 Inventory Summary:');
    console.log(`Total nodes: ${response.nodes?.length || 0}`);
    console.log(`Sources: ${Object.keys(response.sources || {}).join(', ')}`);

    if (!response.nodes || response.nodes.length === 0) {
      console.log('❌ No nodes found in inventory');
      return;
    }

    console.log('\n🏷️  Node Source Analysis:');
    console.log('='.repeat(80));

    const nodesBySource = {};
    const multiSourceNodes = [];

    for (const node of response.nodes) {
      const sources = node.sources || [node.source || 'bolt'];
      const sourcesStr = sources.join(', ');

      console.log(`${node.name.padEnd(25)} | Sources: [${sourcesStr.padEnd(20)}] | Linked: ${node.linked || false}`);

      // Track nodes by source
      for (const source of sources) {
        if (!nodesBySource[source]) {
          nodesBySource[source] = [];
        }
        nodesBySource[source].push(node.name);
      }

      // Track multi-source nodes
      if (sources.length > 1) {
        multiSourceNodes.push({
          name: node.name,
          sources: sources,
          linked: node.linked
        });
      }
    }

    console.log('\n📈 Source Breakdown:');
    console.log('='.repeat(50));
    for (const [source, nodes] of Object.entries(nodesBySource)) {
      console.log(`${source}: ${nodes.length} nodes`);
      console.log(`  - ${nodes.join(', ')}`);
    }

    console.log('\n🔗 Multi-Source Nodes:');
    console.log('='.repeat(50));
    if (multiSourceNodes.length === 0) {
      console.log('❌ No multi-source nodes found');
      console.log('   This might indicate the node linking is not working correctly');
    } else {
      for (const node of multiSourceNodes) {
        console.log(`✅ ${node.name}: [${node.sources.join(', ')}] (linked: ${node.linked})`);
      }
    }

    // Specific check for puppet.office.lab42
    console.log('\n🎯 Specific Node Analysis: puppet.office.lab42');
    console.log('='.repeat(50));
    const puppetNode = response.nodes.find(n => n.name === 'puppet.office.lab42');
    if (puppetNode) {
      console.log(`Name: ${puppetNode.name}`);
      console.log(`ID: ${puppetNode.id}`);
      console.log(`URI: ${puppetNode.uri}`);
      console.log(`Source: ${puppetNode.source || 'not set'}`);
      console.log(`Sources Array: [${(puppetNode.sources || []).join(', ')}]`);
      console.log(`Linked: ${puppetNode.linked || false}`);
      console.log(`Transport: ${puppetNode.transport}`);

      if (puppetNode.sources && puppetNode.sources.length === 1) {
        console.log('⚠️  ISSUE: This node only shows one source but should show multiple');
        console.log('   Expected: Should appear in both Bolt and PuppetDB inventories');
      }
    } else {
      console.log('❌ puppet.office.lab42 not found in inventory');
    }

  } catch (error) {
    console.error('❌ Error debugging inventory:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('1. Make sure the backend server is running');
    console.log('2. Check if the API port is correct (currently set to 3001)');
    console.log('3. Verify the API endpoint is accessible');
  }
}

// Run the debug script
console.log('🚀 Starting Inventory Linking Debug Script');
console.log(`Connecting to: http://${API_HOST}:${API_PORT}${API_PATH}`);
debugInventoryLinking();
