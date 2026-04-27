import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const SIM = process.env.VITE_SIM === '1'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      'import.meta.env.VITE_SIM': JSON.stringify(SIM ? '1' : ''),
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    define: {
      'import.meta.env.VITE_SIM': JSON.stringify(SIM ? '1' : ''),
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_SIM': JSON.stringify(SIM ? '1' : ''),
    },
  },
})
