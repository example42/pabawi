# MultiSourceFactsViewer Component

## Overview

The `MultiSourceFactsViewer` component displays facts from multiple sources (Bolt, PuppetDB, and Puppetserver) with timestamps, source attribution, and automatic categorization.

## Features

- **Multi-Source Support**: Displays facts from Bolt, PuppetDB, and Puppetserver
- **Source Attribution**: Clear badges showing which source each fact comes from
- **Timestamp Display**: Shows when facts were gathered from each source
- **Automatic Categorization**: Organizes facts into System, Network, Hardware, and Custom categories
- **Source Filtering**: Allows viewing facts from all sources or filtering by specific source
- **Graceful Error Handling**: Shows errors for individual sources while preserving data from other sources
- **Collapsible Categories**: Accordion-style display for better organization

## Usage

```svelte
<MultiSourceFactsViewer
  boltFacts={facts}
  boltLoading={factsLoading}
  boltError={factsError}
  onGatherBoltFacts={gatherFacts}
  puppetdbFacts={puppetdbFacts}
  puppetdbLoading={puppetdbFactsLoading}
  puppetdbError={puppetdbFactsError}
  puppetserverFacts={puppetserverFacts}
  puppetserverLoading={puppetserverFactsLoading}
  puppetserverError={puppetserverFactsError}
/>
```

## Props

### Bolt Facts

- `boltFacts`: Facts gathered from Bolt (includes `facts`, `gatheredAt`, and optional `command`)
- `boltLoading`: Loading state for Bolt facts
- `boltError`: Error message for Bolt facts
- `onGatherBoltFacts`: Optional callback to refresh Bolt facts

### PuppetDB Facts

- `puppetdbFacts`: Facts from PuppetDB (includes `facts` and `timestamp`)
- `puppetdbLoading`: Loading state for PuppetDB facts
- `puppetdbError`: Error message for PuppetDB facts

### Puppetserver Facts

- `puppetserverFacts`: Facts from Puppetserver (includes `facts` and `timestamp`)
- `puppetserverLoading`: Loading state for Puppetserver facts
- `puppetserverError`: Error message for Puppetserver facts

## Fact Categories

Facts are automatically categorized based on their keys:

### System

- Operating system information (os, kernel, architecture)
- System identifiers (hostname, fqdn, domain)
- Software versions (puppet, ruby)
- Uptime and timezone

### Network

- IP addresses (IPv4 and IPv6)
- MAC addresses
- Network interfaces
- Gateway and DNS information

### Hardware

- Memory and swap information
- Processor details
- Block devices and disks
- Hardware identifiers (serial number, UUID)

### Custom

- Any facts that don't match the above categories

## Requirements Validated

This component validates the following requirements:

- **6.2**: Display facts with source attribution
- **6.3**: Display facts from multiple sources with timestamps
- **6.4**: Organize facts by category
- **6.5**: Show error messages while preserving facts from other sources

## Implementation Notes

- Facts from all sources are loaded in parallel when the Facts tab is opened
- Each source can fail independently without affecting other sources
- The component uses the existing `FactsViewer` component for rendering individual fact trees
- Source selection tabs only appear when multiple sources have facts available
- Categories are collapsible for better navigation of large fact sets
