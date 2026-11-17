const fs = require('fs');
const path = require('path');

const root = __dirname;
const output = path.join(root, 'dist');
const vendor = path.join(output, 'vendor');
const icons = path.join(output, 'icons');

fs.mkdirSync(vendor, { recursive: true });
fs.mkdirSync(icons, { recursive: true });

for (const [source, destination] of [
  ['web.html', path.join(output, 'index.html')],
  ['app.js', path.join(output, 'app.js')],
  ['public/manifest.webmanifest', path.join(output, 'manifest.webmanifest')],
  ['public/icons/icon-192.png', path.join(icons, 'icon-192.png')],
  ['public/icons/icon-512.png', path.join(icons, 'icon-512.png')],
  [
    path.join('node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'),
    path.join(vendor, 'supabase.js')
  ]
]) {
  fs.copyFileSync(path.join(root, source), destination);
}

console.log('Netlify static site built in dist/');
