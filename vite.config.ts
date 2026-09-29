import { defineConfig, type Plugin } from 'vite';
import { statSync } from 'node:fs';

/**
 * Écran de chargement : au build, retire la balise du module d'entrée et la remplace par la liste
 * des fichiers lourds (url + taille). Le script en ligne d'index.html les télécharge en comptant les
 * octets (vraie barre de progression), puis injecte le module, servi alors depuis le cache HTTP.
 */
function bootProgress(): Plugin {
  return {
    name: 'boot-progress',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const files: Array<{ u: string; s: number }> = [];
        let entry = '';
        for (const out of Object.values(bundle)) {
          if (out.type !== 'chunk') continue;
          const url = './' + out.fileName;
          if (out.isEntry) entry = url;
          files.push({ u: url, s: Buffer.byteLength(out.code) });
        }
        // Le héros (fichier public), récupéré ensuite par GLTFLoader à la même adresse
        files.push({ u: './models/hero.glb', s: statSync('public/models/hero.glb').size });
        const tag = new RegExp(`<script type="module"[^>]*src="${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*></script>\\s*`);
        if (!entry || !tag.test(html)) throw new Error('boot-progress : balise du module introuvable');
        const manifest = `<script>window.__BOOT_FILES = ${JSON.stringify({ entry, files })};</script>\n    `;
        return html.replace(tag, manifest).replace(/<link rel="modulepreload"[^>]*>\s*/g, '');
      },
    },
  };
}

export default defineConfig({
  base: './',
  // Les addons (GLTFLoader…) importent « three » : on les branche sur la même instance que le jeu
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
  plugins: [bootProgress()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 8000,
  },
});
