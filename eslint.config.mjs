import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// One lint config for both workspaces (backend/ and frontend/).
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { settings: { next: { rootDir: "frontend/" } } },
  globalIgnores([
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    "**/src/generated/**",
    "**/playwright-report/**",
    "**/test-results/**",
  ]),
]);

export default eslintConfig;
