import { Platform } from "react-native";
import { registerRootComponent } from "expo";
import { SafeAreaProvider } from "react-native-safe-area-context";

if (Platform.OS === "web" && typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent =
    "html, body, #root { height: 100%; width: 100%; margin: 0; } #root { display: flex; flex-direction: column; }";
  document.head.appendChild(style);

  const showWebFatal = (label, err) => {
    const root = document.getElementById("root");
    if (!root) return;
    const message =
      err?.stack ||
      err?.message ||
      (typeof err === "string" ? err : JSON.stringify(err, null, 2));
    root.innerHTML = `<pre style="box-sizing:border-box;margin:0;padding:16px;white-space:pre-wrap;font:14px/1.45 system-ui,sans-serif;color:#991b1b;background:#fef2f2;min-height:100vh">${label}\n\n${message}</pre>`;
  };

  window.addEventListener("error", (event) => {
    showWebFatal("Web runtime error", event.error || event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    showWebFatal("Unhandled promise rejection", event.reason);
  });
}

import App from "./App";

function Root() {
  return (
    <SafeAreaProvider>
      <App />
    </SafeAreaProvider>
  );
}

registerRootComponent(Root);
