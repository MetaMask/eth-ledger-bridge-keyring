import {defineConfig} from 'vite';
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
    plugins: [
        [legacy({
            targets: ['defaults', 'not IE 11'],
        }),]
    ],
    build: {
        chunkSizeWarningLimit: 1000,
        rollupOptions:{
            output: {
                manualChunks,
            },
        },
        target: 'es2015',
        outDir: 'dist',
        sourcemap: true,
    },
});

function manualChunks(id) {
    if (id.includes('node_modules')) {
        //@ledgerhq library is big, so we want to separate it into its own chunk
        if(id.includes('node_modules/@ledgerhq')) {
            return id.split('node_modules/@ledgerhq/')[1].split('/')[0].toString();
        }
        return "vendor";
    }
}

