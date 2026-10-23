// Bundles the server for AWS Lambda into .lambda/ with the demo data and the built simulator.
// Run after `npm run build:sim`. Used by template.yaml (CodeUri: .lambda).
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const out = join(root, ".lambda");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(root, "src", "lambda.ts")],
  outfile: join(out, "index.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  minify: true,
  sourcemap: false,
  // The AWS SDK v3 ships in the Lambda Node.js runtime.
  external: ["@aws-sdk/*"],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});

cpSync(join(root, "data"), join(out, "data"), { recursive: true });
const sim = join(root, "simulator", "dist");
if (existsSync(sim)) cpSync(sim, join(out, "simulator"), { recursive: true });
else console.warn("simulator/dist missing: run `npm run build:sim` first to include the simulator");
writeFileSync(join(out, "package.json"), JSON.stringify({ type: "module" }));
console.log("Lambda bundle ready in .lambda/");
