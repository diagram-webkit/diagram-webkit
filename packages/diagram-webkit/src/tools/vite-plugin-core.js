// The Vite plugin's hooks (diagramWebkit() in vite-plugin.js picks this file
// from the installed package or, with DIAGRAM_WEBKIT_DIR, from the checkout).
// Fills <head> and <noscript> from the definition, keeps the generated
// tag-description module in sync with its markdown, and marks dev-server
// pages as development mode.
import path from "node:path";
import { MODE_META_NAME } from "diagram-webkit/core";
import { loadDefinitionWith } from "./definition-loader.js";
import { localEngineAliases } from "./local-engine.js";
import { applyPageDocument, pageTags } from "./page-template.js";
import { readTagTreeMarkdown, writeTagTreeModule } from "./tag-tree-markdown.js";

function localEngineConfig(engineDir, userConfig, host) {
  const root = path.resolve(userConfig.root || process.cwd());
  return {
    resolve: { alias: localEngineAliases(engineDir, "source") },
    optimizeDeps: { exclude: ["diagram-webkit"] },
    server: { fs: { allow: [host.searchForWorkspaceRoot(root), engineDir] } },
  };
}

/**
 * The plugin itself. Imports no Vite: `host` carries what it needs from the
 * project's own Vite (vite-plugin.js), so a checkout's copy of this file can
 * run in the project without loading a second Vite.
 * @param {Record<string, any>} options diagramWebkit() options
 * @param {string | null} engineDir the local checkout (DIAGRAM_WEBKIT_DIR), or null
 * @param {{ searchForWorkspaceRoot: (root: string) => string, runnerImport: Function }} host
 */
export function createPlugin(options, engineDir, host) {
  let root = process.cwd();
  let command = "build";
  let pagePromise = null;

  const resolve = (file) => path.resolve(root, file);

  // Fails the build on a missing heading or an empty tree.
  function syncTagTree() {
    const { tagTree } = options;
    if (!tagTree) return false;
    if (!tagTree.out) {
      readTagTreeMarkdown(resolve(tagTree.file), tagTree.heading);
      return false;
    }
    return writeTagTreeModule(resolve(tagTree.file), resolve(tagTree.out), tagTree.heading);
  }

  function loadPage() {
    if (options.page) return Promise.resolve(options.page);
    if (!options.definition) return Promise.resolve({});
    pagePromise ??= loadDefinitionWith(host.runnerImport, resolve(options.definition)).then((definition) => (definition.content && definition.content.page) || {});
    return pagePromise;
  }

  // One self-contained index.html: every script and stylesheet the page
  // references goes inline, and the files go. Opens from disk and needs no
  // other request.
  function inlineBundle(bundle) {
    const page = Object.values(bundle).find((file) => file.type === "asset" && file.fileName.endsWith(".html"));
    if (!page) return;
    let html = String(page.source);
    const take = (reference) => {
      const name = reference.replace(/^\.?\//, "");
      const file = bundle[name];
      if (!file) throw new Error(`diagram-webkit singleFile: ${reference} is not in the build output`);
      delete bundle[name];
      return file.type === "chunk" ? file.code : String(file.source);
    };
    html = html.replace(/<script\b([^>]*?)\ssrc="([^"]+)"([^>]*)><\/script>/g, (match, before, src, after) => {
      const attrs = `${before}${after}`.replace(/\scrossorigin(="[^"]*")?/g, "");
      // A literal </script> inside the code would end the element.
      return `<script${attrs}>${take(src).replace(/<\/script/gi, "<\\/script")}</script>`;
    });
    html = html.replace(/<link\b[^>]*?rel="stylesheet"[^>]*?href="([^"]+)"[^>]*>/g, (match, href) => `<style>${take(href)}</style>`);
    html = html.replace(/<link\b[^>]*?rel="modulepreload"[^>]*>\s*/g, "");
    const left = Object.keys(bundle).filter((name) => name !== page.fileName);
    if (left.length > 0) throw new Error(`diagram-webkit singleFile: not inlined, still separate files: ${left.join(", ")}`);
    page.source = html;
  }

  return {
    name: "diagram-webkit",
    config(userConfig) {
      const config = engineDir ? localEngineConfig(engineDir, userConfig, host) : {};
      if (options.singleFile) {
        config.build = {
          assetsInlineLimit: () => true,
          cssCodeSplit: false,
          modulePreload: false,
          rollupOptions: { output: { inlineDynamicImports: true } },
        };
      }
      return config;
    },
    generateBundle: {
      order: "post",
      handler(outputOptions, bundle) {
        if (options.singleFile) inlineBundle(bundle);
      },
    },
    configResolved(config) {
      root = config.root;
      command = config.command;
      if (engineDir) config.logger.info(`diagram-webkit: local engine ${engineDir} (browser code and this plugin)`);
      // Before anything imports the generated module.
      syncTagTree();
    },
    buildStart() {
      if (options.tagTree) this.addWatchFile(resolve(options.tagTree.file));
    },
    handleHotUpdate({ file }) {
      if (options.tagTree && file === resolve(options.tagTree.file)) syncTagTree();
      if (options.definition && file.startsWith(root) && !file.includes("node_modules")) pagePromise = null;
    },
    transformIndexHtml: {
      order: "pre",
      async handler(html) {
        const page = await loadPage();
        // The dev server is development mode: mountDiagram applies the
        // definition's `development` fields.
        const mode = command === "serve" ? [{ tag: "meta", attrs: { name: MODE_META_NAME, content: "development" }, injectTo: "head" }] : [];
        return { html: applyPageDocument(html, page), tags: [...pageTags(page), ...mode] };
      },
    },
  };
}
