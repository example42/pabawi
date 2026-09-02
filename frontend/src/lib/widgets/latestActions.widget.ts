import { registerWidget } from '../widgetRegistry.svelte';
import LatestActionsWidget from '../../components/LatestActionsWidget.svelte';

registerWidget({
  id: 'core-latest-actions',
  name: 'Latest Actions',
  component: LatestActionsWidget,
  integration: 'bolt',
  type: 'list',
  colSpan: 2,
  priority: 20,
});
