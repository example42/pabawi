import { registerWidget } from '../widgetRegistry.svelte';
import PuppetAgentActionsWidget from '../../components/PuppetAgentActionsWidget.svelte';

registerWidget({
  id: 'puppetdb-agent-actions',
  name: 'Puppet Agent Actions',
  component: PuppetAgentActionsWidget,
  integration: 'puppetdb',
  type: 'action',
  colSpan: 1,
  priority: 50,
});
