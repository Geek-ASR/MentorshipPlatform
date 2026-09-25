import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import security from "eslint-plugin-security";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='sql'][callee.property.name='raw'] TemplateLiteral[expressions.length>0]",
          message:
            "Do not interpolate runtime values into sql.raw; use parameterized sql`` templates.",
        },
      ],
    },
  },
  {
    // ReDoS guard (docs/11 AC14) for the trust module's contact-info/claim-phrase detectors —
    // scoped there rather than repo-wide so it doesn't need auditing every pre-existing regex in
    // the codebase in one pass.
    files: ["src/server/modules/trust/domain/detectors.ts"],
    plugins: { security },
    rules: { "security/detect-unsafe-regex": "error" },
  },
  {
    files: ["scripts/**", "tests/**"],
    rules: { "no-console": "off" },
  },
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "drizzle/**",
    "docs/**",
  ]),
]);
