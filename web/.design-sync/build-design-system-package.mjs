// design-system/ is raw shadcn source inside the Next.js app, not a
// standalone built package (no dist/, no .d.ts, no compiled CSS). This
// script synthesizes a scratch "package" the design-sync converter can
// treat as a real one — a JS entry, a real tsc-emitted .d.ts tree (for
// accurate CVA variant prop unions), and compiled Tailwind CSS scanned from
// app/globals.css. Everything it writes lives under .ds-sync/pkgscratch/
// (gitignored, rebuilt from scratch every run) — this script itself is the
// durable, committed part. Re-run before every design-sync build/re-sync.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const ROOT = resolve(".");
const SCRATCH = resolve(".ds-sync/pkgscratch");
const UI_DIR = resolve("design-system/ui");

rmSync(SCRATCH, { recursive: true, force: true });
mkdirSync(resolve(SCRATCH, "types"), { recursive: true });

const uiFiles = readdirSync(UI_DIR)
  .filter((f) => /\.tsx$/.test(f) && !/\.(stories|test|spec)\./.test(f))
  .sort();
if (!uiFiles.length) {
  console.error("[PREPARE] no design-system/ui/*.tsx files found");
  process.exit(1);
}
const names = uiFiles.map((f) => f.replace(/\.tsx$/, ""));

// ── scratch package.json ────────────────────────────────────────────────
writeFileSync(
  resolve(SCRATCH, "package.json"),
  JSON.stringify(
    { name: "design-system", version: "0.1.0", private: true, main: "index.mjs", types: "types/index.d.ts" },
    null,
    2,
  ) + "\n",
);

// ── JS entry (esbuild bundles this; @/* aliases resolved via cfg.tsconfig) ─
writeFileSync(
  resolve(SCRATCH, "index.mjs"),
  names.map((n) => `export * from "../../design-system/ui/${n}.tsx";`).join("\n") + "\n",
);

// ── real .d.ts tree via tsc (declaration-only compile of just these files) ─
const dtsTsconfigPath = resolve(".ds-sync/dts.tsconfig.json");
writeFileSync(
  dtsTsconfigPath,
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        module: "esnext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        declaration: true,
        emitDeclarationOnly: true,
        skipLibCheck: true,
        esModuleInterop: true,
        strict: true,
        baseUrl: "..",
        paths: { "@/*": ["./*"] },
        outDir: "./pkgscratch/types",
        rootDir: "..",
      },
      include: [...names.map((n) => `../design-system/ui/${n}.tsx`), "../lib/utils.ts"],
    },
    null,
    2,
  ) + "\n",
);
execFileSync("npx", ["tsc", "-p", dtsTsconfigPath], { cwd: ROOT, stdio: "inherit" });

writeFileSync(
  resolve(SCRATCH, "types/index.d.ts"),
  names.map((n) => `export * from "./design-system/ui/${n}";`).join("\n") + "\n",
);

// ── compiled CSS: run Tailwind over the app's real globals.css (tokens +
// shadcn preset + every utility class actually used in the app, including
// design-system/ui) so component styling matches production exactly. Does
// NOT depend on `next build` succeeding — pure PostCSS content scan.
const input = resolve("app/globals.css");
const css = readFileSync(input, "utf8");
const result = await postcss([tailwind({ base: ROOT })]).process(css, {
  from: input,
  to: resolve(SCRATCH, "compiled.css"),
});
writeFileSync(resolve(SCRATCH, "compiled.css"), result.css);

console.log(`[PREPARE] ${names.length} components, ${result.css.length} bytes CSS -> ${SCRATCH}`);
