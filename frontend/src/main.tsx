import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ApiError } from "./api/client";
import { App } from "./app/App";
import "./index.css";

// Apply the stored theme before first paint.
document.documentElement.dataset.theme = localStorage.getItem("ll_theme") === "dark" ? "dark" : "light";

// Paper is white: print in the light theme, then restore the user's theme.
window.addEventListener("beforeprint", () => (document.documentElement.dataset.theme = "light"));
window.addEventListener("afterprint", () => {
  document.documentElement.dataset.theme = localStorage.getItem("ll_theme") === "dark" ? "dark" : "light";
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // 4xx answers (not found, no verdict yet, expired link) won't change on retry.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 3,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
