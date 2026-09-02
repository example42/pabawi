import { registerWidget } from '../widgetRegistry.svelte';
import GeneralInfoWidget from '../../components/GeneralInfoWidget.svelte';

registerWidget({
  id: 'core-general-info',
  name: 'General Information',
  component: GeneralInfoWidget,
  integration: 'bolt',
  type: 'summary',
  colSpan: 2,
  priority: 10,
});
