import { writeFile } from 'node:fs/promises';
import { render, esc } from '../apps/mobile/public/th/components.mjs';
import { ui } from '../apps/mobile/public/th/content.mjs';
const directory = new URL('../apps/mobile/public/th/', import.meta.url);
for (const lang of ['th', 'en', 'zh']) {
 const filename = lang === 'th' ? 'index.html' : lang + '.html';
 const canonical = 'https://chivargo.com/th/' + (lang === 'th' ? '' : filename);
 const title = 'ChivarGo — ' + ui.headline[lang] + ' · ' + ui.highlight[lang];
 const schema = { '@context':'https://schema.org', '@type':'WebSite', name:'ChivarGo', url:canonical, inLanguage:lang };
 await writeFile(new URL(filename, directory), '<!doctype html>\n<html lang="'+lang+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+'</title><meta name="description" content="'+esc(ui.intro[lang])+'"><link rel="canonical" href="'+canonical+'">'+['th','en','zh'].map(l=>'<link rel="alternate" hreflang="'+l+'" href="https://chivargo.com/th/'+(l==='th'?'':l+'.html')+'">').join('')+'<meta name="theme-color" content="#083b55"><meta property="og:type" content="website"><meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(ui.intro[lang])+'"><meta property="og:url" content="'+canonical+'"><meta property="og:image" content="https://chivargo.com/th/img/og.jpg"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="img/icon-512.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="promo.css"><link rel="preload" as="image" href="img/hero.webp"><script type="application/ld+json">'+JSON.stringify(schema)+'</script></head><body>'+render(lang)+'<script type="module" src="promo.js"></script></body></html>\n');
}
console.log('Generated ChivarGo promo pages: TH / EN / ZH');
