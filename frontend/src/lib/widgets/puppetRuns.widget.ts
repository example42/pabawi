import { registerWidget } from '../widgetRegistry.svelte';
import PuppetRunsWidget from '../../components/PuppetRunsWidget.svelte';

registerWidget({
  id: 'puppetdb-latest-runs',
  name: 'Latest Puppet Runs',
  component: PuppetRunsWidget,
  integration: 'puppetdb',
  type: 'list',
  colSpan: 3,
  priority: 100,
});
