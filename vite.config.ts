import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import dts from "vite-plugin-dts";
import tsconfigPaths from "vite-tsconfig-paths";
import * as path from "path";

export default defineConfig({
    root: __dirname,
    cacheDir: "./node_modules/.vite/fetchling",
    plugins: [
        react(),
        tsconfigPaths(),
        dts({
            entryRoot: "src",
            tsconfigPath: path.join(__dirname, "tsconfig.lib.json"),
        }),
    ],
    // Configuration for building as a library.
    build: {
        outDir: "./dist",
        emptyOutDir: true,
        reportCompressedSize: true,
        commonjsOptions: {
            transformMixedEsModules: true,
        },
        lib: {
            // Could also be a dictionary or array of multiple entry points.
            entry: "src/index.ts",
            name: "fetchling",
            fileName: "index",
            // Change this to the formats you want to support.
            // Don't forget to update your package.json as well.
            formats: ["es", "cjs"],
        },
        rollupOptions: {
            // External packages that should not be bundled into your library.
            external: [
                "react",
                "react-dom",
                "react/jsx-runtime",
                "@tanstack/react-query",
                "@sameera/quantum",
            ],
        },
    },
    test: {
        watch: false,
        globals: true,
        environment: "jsdom",
        include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
        setupFiles: ["./src/test-setup.ts"],
        reporters: ["default"],
        coverage: {
            reportsDirectory: "./coverage",
            provider: "v8",
        },
    },
});
