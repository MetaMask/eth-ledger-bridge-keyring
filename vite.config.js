import { defineConfig } from "vite";
import legacy from "@vitejs/plugin-legacy";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    [
      legacy({
        // This will generate both modern and legacy builds, with the legacy build targeting not IE 11
        // and the modern build targeting the last 2 versions of all browsers and not dead browsers
        targets: ["last 2 versions, not dead, > 0.2%", "not IE 11"],
      }),
      nodePolyfills(),
    ],
  ],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
    target: "es2015",
    outDir: "dist",
    sourcemap: true,
  },
});

function manualChunks(id) {
  if (id.includes("node_modules")) {
    //@ledgerhq library is big, so we want to separate it into its own chunk
    if (id.includes("node_modules/@ledgerhq")) {
      return id.split("node_modules/@ledgerhq/")[1].split("/")[0].toString();
    }
    return "vendor";
  }
}
