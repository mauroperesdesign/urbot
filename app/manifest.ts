import type { MetadataRoute } from 'next';

// Permite "Adicionar à Tela de Início" com o logo e abrir como aplicativo
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Biblioteca Umbandista',
    short_name: 'Biblioteca',
    description: 'Acervo de estudo do Grupo de Estudos da Umbanda En Tenda.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F1EADD',
    theme_color: '#1F5EFF',
    lang: 'pt-BR',
    icons: [
      { src: '/icon-entenda-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-entenda-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-entenda-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
