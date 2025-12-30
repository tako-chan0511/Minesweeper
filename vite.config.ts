import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pagesのプロジェクト名（リポジトリ名）に合わせて設定
  base: '/Minesweeper/', 
  
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true 
      },
      manifest: {
        name: 'マインスイーパ (Minesweeper)',
        short_name: 'マインスイーパ',
        description: '盤面サイズを自由に変更できるマインスイーパーゲームです。',
        // start_url は base からの相対パス '.' にするのが最も確実です
        start_url: '.', 
        display: 'standalone',
        background_color: '#ffffff',
        // アイコンのテーマカラーに合わせます
        theme_color: '#475E75',
        icons: [
          {
            src: 'icon-192x192.png', // publicディレクトリからの相対パス
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512x512.png', // publicディレクトリからの相対パス
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  // ビルド時に'@'を'src'として解決するための設定
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
