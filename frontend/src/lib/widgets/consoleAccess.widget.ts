import { registerWidget } from '../widgetRegistry.svelte';
import ConsoleAccessWidget from '../../components/ConsoleAccessWidget.svelte';

registerWidget({
  id: 'proxmox-console-access',
  name: 'Console Access',
  component: ConsoleAccessWidget,
  integration: 'proxmox',
  type: 'action',
  colSpan: 1,
  priority: 100,
});
