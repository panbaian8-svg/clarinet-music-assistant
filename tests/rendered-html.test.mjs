import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Music Teaching Assistant workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>音乐助教｜单簧管新手识谱与指法练习<\/title>/i);
  assert.match(html, /音乐助教/);
  assert.match(html, /上传谱面照片/);
  assert.match(html, /当前音符/);
  assert.match(html, /识别结果与逐拍练习/);
  assert.match(html, /休止符/);
  assert.match(html, /附点/);
  assert.match(html, /十六分/);
  assert.match(html, /本地识谱已启用/);
  assert.match(html, /完整单簧管指法库/);
  assert.match(html, /E3–A6/);
  assert.match(html, /42 音 · 19 替代/);
  assert.match(html, /61 套分开指法/);
  assert.match(html, /看得懂、按得对、听得见/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/i);
});

test("ships local recognition, correction tools, and the complete fingering data", async () => {
  const [page, layout, recognizer, fingerings, packageJson, fingeringAssets] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/score-recognition.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/clarinet.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readdir(new URL("../public/fingerings/", import.meta.url)),
    access(new URL("../public/og.png", import.meta.url)),
  ]);

  assert.match(page, /recognizeScoreImage/);
  assert.match(page, /校对当前音符/);
  assert.match(page, /new AudioContext\(\)/);
  assert.match(page, /type="file"/);
  assert.match(recognizer, /estimateSkew/);
  assert.match(recognizer, /detectStaves/);
  assert.match(recognizer, /detectAccidental/);
  assert.match(recognizer, /detectRestCandidates/);
  assert.match(recognizer, /classifyRestGlyph/);
  assert.match(recognizer, /detectBeamCount/);
  assert.match(recognizer, /detectAugmentationDot/);
  assert.doesNotMatch(recognizer, /fetch\(|XMLHttpRequest|OPENAI_API_KEY/);
  assert.match(fingerings, /Array\.from\(\{ length: 42 \}/);
  assert.match(fingerings, /TOTAL_FINGERING_VARIANTS/);
  assert.match(fingerings, /ALTERNATE_FINGERING_SOURCE_INDICES/);
  assert.match(fingerings, /yamaha\.com/);
  assert.equal(fingeringAssets.filter((name) => name.endsWith(".webp")).length, 61);
  assert.match(page, /标准单簧管键位图/);
  assert.match(layout, /openGraph/);
  assert.doesNotMatch(page, /SkeletonPreview|_sites-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", projectRoot)));
});
