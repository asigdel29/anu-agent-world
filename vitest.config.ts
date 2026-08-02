import { defineConfig } from "vitest/config";

// Two projects, deliberately separated by environment. Client modules may touch
// the DOM; worker and shared modules must not, so running them under "node"
// turns an accidental `window` reference into a test failure rather than a
// production surprise.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "client",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
        },
      },
      {
        test: {
          name: "worker",
          environment: "node",
          include: ["server/**/*.test.ts", "shared/**/*.test.ts", "protocol/**/*.test.ts"],
        },
      },
    ],
  },
});
