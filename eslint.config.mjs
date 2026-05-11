import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // 1. 全局忽略
  {
    ignores: ["node_modules/", "out/", "dist/", "*.vsix", ".vscode-test/"]
  },

  // 2. 基础 ESLint 推荐规则
  eslint.configs.recommended,

  // 3. TypeScript 推荐规则
  ...tseslint.configs.recommended,

  // 4. 针对 src 目录的自定义规则
  {
    files: ["src/**/*.ts"],
    rules: {
      // ---- TypeScript 相关 ----
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/consistent-type-imports": "warn",

      // ---- 通用规则 ----
      "no-console": "off",
      "no-debugger": "error",
      "prefer-const": "warn",
      "no-var": "error",
      eqeqeq: ["error", "smart"],
      "no-return-await": "error",
      "require-await": "warn"
    }
  },

  // 5. 针对测试文件的宽松规则
  {
    files: ["src/tests/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off"
    }
  }
);
