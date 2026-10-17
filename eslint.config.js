import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "**/dist/",
      "**/node_modules/",
      "coverage/",
      // Separate projects with their own checks: the Python worker, the video example,
      // and the maths app's Node build scripts. The app's own src/ and test/ are linted here.
      "worker/",
      "examples/",
      "learn/build.mjs",
      "learn/scripts/",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
);
