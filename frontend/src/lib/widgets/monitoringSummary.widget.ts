import { registerWidget } from '../widgetRegistry.svelte';
import MonitoringSummaryWidget from '../../components/MonitoringSummaryWidget.svelte';

registerWidget({
  id: 'checkmk-monitoring-summary',
  name: 'Monitoring Summary',
  component: MonitoringSummaryWidget,
  integration: 'checkmk',
  type: 'summary',
  colSpan: 2,
  priority: 100,
});
