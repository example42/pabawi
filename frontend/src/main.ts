import "./app.css";
import App from "./App.svelte";
import { mount } from "svelte";
import { themeManager } from "./lib/theme.svelte";

const appElement = document.getElementById("app");
if (!appElement) {
  throw new Error("App element not found");
}

// Initialize theme manager
void themeManager;

const app = mount(App, {
  target: appElement,
});

export default app;
