import { ui, features, steps, partners, faq } from './content.mjs';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const lucideNames = { flag:'flag', leaf:'leaf', star:'star', pin:'map-pin', compass:'compass', bot:'bot', map:'map', shield:'shield-check', users:'users', heart:'heart', gift:'gift', bag:'backpack', book:'book-open', shop:'store', bed:'bed', chat:'message-circle', game:'gamepad-2', wallet:'wallet', arrow:'arrow-right' };
const iconCache = new Map();
/*
  How long one icon's node-array may take to evaluate.

  It was 100 ms, and that is a wall-clock budget spent mostly on starting the
  sandbox, not a measure of the work: evaluating a static array of SVG
  attributes takes microseconds. On a loaded machine the start alone overran
  it and the build died mid-run with ERR_SCRIPT_EXECUTION_TIMEOUT - measured
  on 26 November 2026, while generating these very pages. A promo build that
  dies writes nothing, so the symptom is a deploy that quietly carries the
  previous pages. Five seconds still bounds a runaway script, and no longer
  bounds a busy afternoon.
*/
const ICON_TIMEOUT_MS = 5_000;
// Use the same installed Lucide icon package as the app, rendered at build time.
// The sandbox evaluates only the package's static node-array, never browser input.
export const icon = (name) => {
 if (iconCache.has(name)) return iconCache.get(name);
 const source = readFileSync(new URL('../../node_modules/lucide-react-native/dist/esm/icons/'+(lucideNames[name]||'compass')+'.js',import.meta.url),'utf8');
 const nodes = runInNewContext(source.match(/createLucideIcon\("[^"]+", ([\s\S]*?)\);/)[1],{}, {timeout:ICON_TIMEOUT_MS});
 const svg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+nodes.map(([tag,attrs])=>'<'+tag+' '+Object.entries(attrs).filter(([k])=>k!=='key').map(([k,v])=>k+'="'+esc(v)+'"').join(' ')+'/>').join('')+'</svg>';
 iconCache.set(name,svg); return svg;
};
export const esc = (s) => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function render(lang = 'th') {
 const t = v => esc(v[lang]);
 const u = key => t(ui[key]);
 const app = (screen='home',area='koh-sichang') => '/?screen='+screen+'&area='+area+'&lang='+lang;
 const link = (screen,label,cls='button',area) => '<a class="'+cls+'" data-app href="'+app(screen,area)+'">'+label+icon('arrow')+'</a>';
 const pic = (file,alt,cls='') => '<img class="'+cls+'" src="'+(file.includes('.')?file:'img/'+file+'.webp')+'" alt="'+esc(alt)+'" loading="lazy" decoding="async" width="1200" height="800">';
 const title = (k,sub='') => '<div class="section-heading"><span class="eyebrow">CHIVAR GO × ISLAND LIFE</span><h2>'+u(k)+'</h2>'+(sub?'<p>'+u(sub)+'</p>':'')+'</div>';
 const navigation = [['hero','home'],['features','systems'],['destinations','islands'],['partners','partners'],['impact','community'],['faq','help']];
 const header = '<a class="skip" href="#main">'+u('skip')+'</a><header><a class="brand" href="#hero"><img src="img/logo.webp" width="112" height="52" alt="ChivarGo"><span>CHIVAR GO × SICHANG</span></a><nav id="navigation" aria-label="'+u('menu')+'">'+navigation.map(([id,k])=>'<a href="#'+id+'">'+u(k)+'</a>').join('')+'</nav><div class="header-actions"><label class="sr-only" for="language">'+u('language')+'</label><select id="language">'+[['th','ไทย'],['en','EN'],['zh','中文']].map(([l,n])=>'<option value="'+l+'"'+(l===lang?' selected':'')+'>'+n+'</option>').join('')+'</select>'+link('profile',icon('users'),'account-link')+'<button class="menu-toggle" aria-controls="navigation" aria-expanded="false" aria-label="'+u('menu')+'"><span></span><span></span><span></span></button></div></header>';
 const hero = '<section class="hero" id="hero"><div class="hero-photo"></div><div class="wrap hero-grid"><div class="hero-copy"><span class="pill">CHIVAR GO × SICHANG</span><h1>'+u('headline')+'<br><em>'+u('highlight')+'</em><br>'+u('lastline')+'</h1><p>'+u('intro')+'</p><div class="actions">'+link('home',u('open'),'button orange')+'<a class="button secondary" href="#how">'+u('how')+icon('arrow')+'</a></div></div><div class="hero-art"><div class="phone"><div class="phone-camera"></div><img src="img/sichang-adventure.webp" width="600" height="600" alt="'+u('illustration')+'"><div class="phone-content"><span class="eyebrow">CHIVARGO</span><h2>'+u('sichang')+'</h2><div class="phone-icons">'+['map','flag','leaf','bag'].map(icon).join('')+'</div>'+link('adventure',t(features[4][2]),'button')+'</div></div><img class="mascot" src="../media/mascots/changchang-greeting.png" width="500" height="500" alt="ChangChang"></div></div><div class="wrap assurance">'+[['free','compass'],['verified','shield'],['local','users']].map(([k,i])=>'<div>'+icon(i)+'<span>'+u(k)+'</span></div>').join('')+'</div></section>';
 const ecosystem = '<section id="features" class="wrap section">'+title('ecosystem','ecosystemSub')+'<div class="feature-grid">'+features.map(([screen,i,name,desc],index)=>'<a class="feature-card tone-'+index%4+'" '+(screen[0]==='/'?'data-service':'data-app')+' href="'+(screen[0]==='/'?screen:app(screen))+'"><span class="feature-icon">'+icon(i)+'</span><h3>'+t(name)+'</h3><p>'+t(desc)+'</p><span class="card-arrow">'+icon('arrow')+'</span></a>').join('')+'</div></section>';
 const experienceIds = [0,3,5,6,8,9];
 const experiences = '<section id="experiences" class="section pale"><div class="wrap">'+title('experiences','experiencesSub')+'<div class="experience-grid">'+experienceIds.map((idx,n)=>{const f=features[idx];return '<article class="experience-card">'+pic(['beach-cleanup','coastal','ai-bot','../media/places/sc-thamphang.jpg','companions','sichang-adventure'][n],f[2][lang])+'<div class="experience-copy"><span class="feature-icon">'+icon(f[1])+'</span><h3>'+t(f[2])+'</h3><p>'+t(f[3])+'</p>'+link(f[0],u('discover'),'text-link')+'</div></article>';}).join('')+'</div></div></section>';
 const destinations = '<section id="destinations" class="wrap section">'+title('destinations')+'<div class="destination-grid">'+[['sichang','../media/places/sc-palace.jpg','koh-sichang'],['samui','samui','samui']].map(([key,img,area])=>'<article class="destination">'+pic(img,ui[key][lang])+'<div><span class="eyebrow">THAILAND / '+area.toUpperCase()+'</span><h3>'+u(key)+'</h3><p>'+u(key+'Desc')+'</p>'+link('home',u('discover'),'button orange',area)+'</div></article>').join('')+'</div></section>';
 const sustainability = '<section id="impact" class="wrap impact section"><div class="impact-image">'+pic('beach-cleanup',ui.impact[lang])+'<span class="image-label">SMALL ACTIONS. SHARED MEMORIES.</span></div><div>'+title('impact')+'<p>'+u('impactText')+'</p><div class="tags">'+['Green Island','Local Community','Sustainable Tourism'].map(x=>'<span>'+icon('leaf')+x+'</span>').join('')+link('quests',t(features[2][2]),'button')+'</div></section>';
 const how = '<section id="how" class="section pale"><div class="wrap">'+title('steps')+'<ol class="steps">'+steps.map((s,i)=>'<li><span class="step-number">0'+(i+1)+'</span>'+icon(['compass','users','map','star'][i])+'<h3>'+t(s)+'</h3></li>').join('')+'</ol></div></section>';
 const partner = '<section id="partners" class="wrap section">'+title('partnerTitle','partnerText')+'<div class="partner-grid">'+partners.map((p,i)=>'<a class="partner-card" data-service href="/console/apply"><span class="feature-icon">'+icon(['bed','shop','bag','flag','book'][i])+'</span><h3>'+t(p)+'</h3><span class="text-link">'+u('apply')+icon('arrow')+'</span></a>').join('')+'</div></section>';
 const trust = '<section class="wrap trust" id="trust"><span class="trust-icon">'+icon('shield')+'</span><div><h2>'+u('trust')+'</h2><p>'+u('trustText')+'</p></div><a data-service href="/privacy" class="button secondary">'+u('privacy')+'</a></section>';
 const questions = '<section id="faq" class="wrap section faq-layout">'+title('faq')+'<div>'+faq.map(([q,a])=>'<details><summary>'+t(q)+'<span>+</span></summary><p>'+t(a)+'</p></details>').join('')+'</div></section>';
 const final = '<section class="wrap final"><span class="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span><h2>'+u('final')+'</h2><p>'+u('finalText')+'</p>'+link('home',u('open'),'button orange')+'</section>';
 const footer = '<footer><div class="wrap footer-grid"><div><strong class="wordmark">ChivarGo</strong><p>'+u('finalText')+'</p><small>CHIVAR GO × SICHANG</small></div><div><h3>'+u('systems')+'</h3>'+features.slice(0,7).map(f=>link(f[0],t(f[2]),'footer-link')).join('')+'</div><div><h3>'+u('partners')+'</h3><a data-service href="/console/apply">'+u('apply')+'</a><a data-service href="/console">Host Console</a><a data-app href="'+app('profile')+'">'+u('account')+'</a></div><div><h3>'+u('help')+'</h3><a href="#faq">'+u('faq')+'</a><a data-service href="/privacy">'+u('privacy')+'</a><a data-service href="/about">'+u('about')+'</a></div></div><div class="wrap copyright">© '+new Date().getFullYear()+' ChivarGo · Smart Wellness & Sustainable Tourism</div></footer>';
 return header+'<div id="offline" role="status" hidden>'+u('offline')+'</div><main id="main">'+hero+ecosystem+experiences+destinations+sustainability+how+partner+trust+questions+final+'</main>'+footer;
}
