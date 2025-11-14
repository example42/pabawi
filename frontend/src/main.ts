import "./app.css";
import App from "./App.svelte";
import { mount } from "svelte";

const appElement = document.getElementById("app");
if (!appElement) {
  throw new Error("App element not found");
}

console.log("Starting Pabawi app...");
console.log("App element:", appElement);

const app = mount(App, {
  target: appElement,
});

console.log("App mounted successfully");

export default app;
