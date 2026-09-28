import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Les addons (GLTFLoader…) importent « three » : on les branche sur la même instance que le jeu
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 8000,
  },
});
