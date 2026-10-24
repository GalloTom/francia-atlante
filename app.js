
'use strict';
const DATA=JSON.parse(document.getElementById('catalog-data').textContent);
const META=DATA.metadata,BASE_PLACES=DATA.places,PLACES=BASE_PLACES.slice(),BYID=new Map(PLACES.map(p=>[p.id,p]));
const COLORS={borghi:'#78684e',costa:'#3c8391',natura:'#638345',castelli:'#b6754d',religione:'#777095',musei:'#aa7659',megaliti:'#77824d',memoria:'#496b75',fari:'#548d82',patrimonio:'#91836b',gastronomia:'#a26c50',alloggi:'#7c7694',shopping:'#99815b',attivita:'#5f887a',spettacoli:'#956b88',servizi:'#698087'};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function normalize(s){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[\u2019']/g,' ').replace(/[^a-z0-9]+/g,' ').trim();}
function icon(name){return `<svg class="ico" aria-hidden="true"><use href="#i-${esc(name)}"/></svg>`;}
function safeURL(s){try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}}
// Public read-only basemap keys belong in map-config.js, never backend secrets.
const RAW_MAP_CONFIG=window.ATLAS_MAP_CONFIG||{};
function cleanMapKey(key){
 const k=String(key||'').trim();
 return /^[A-Za-z0-9._-]{8,200}$/.test(k)&&!(/^(sb_|eyJ|gh[pousr]_|github_pat_|sk_)/.test(k))?k:'';
}
const MAP_CONFIG={defaultStyle:'maptiler',maptilerKey:cleanMapKey(RAW_MAP_CONFIG.maptilerKey)};
const BASEMAPS={maptiler:{label:'MapTiler Streets',online:true,url:(z,x,y)=>`https://api.maptiler.com/maps/streets-v4/256/${z}/${x}/${y}.png?key=${encodeURIComponent(MAP_CONFIG.maptilerKey)}`,attribution:'<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">&copy; MapTiler</a> &middot; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">&copy; OpenStreetMap contributors</a>'}};
function setTileMessage(message,retry=false){
 const el=$('#tile-state');el.replaceChildren();el.hidden=!message;if(!message)return;
 const title=document.createElement('strong');title.textContent='Sfondo MapTiler';el.append(title,document.createTextNode(message));
 if(retry){const b=document.createElement('button');b.className='tile-retry';b.textContent='Riprova';b.onclick=()=>atlas.retryTiles();el.append(b);}
}
function initMapStyles(){if(!MAP_CONFIG.maptilerKey)setTileMessage('Manca la chiave pubblica MapTiler in map-config.js. I punti restano consultabili; non viene caricato un altro sfondo.');else atlas.draw();}
function importanceLevel(p){return [1,2,3].includes(p.importance?.level)?p.importance.level:1;}
function importanceLabel(p){return {1:'In catalogo',2:'In evidenza',3:'In primo piano'}[importanceLevel(p)];}
function prominenceOrder(a,b){return importanceLevel(b)-importanceLevel(a)||a.name.localeCompare(b.name,'it')||a.id.localeCompare(b.id);}
function markerSize(level){return {1:24,2:34,3:44}[level]||24;}
const SEARCH=new Map();
function indexPlace(p){SEARCH.set(p.id,normalize([p.name,p.region,p.guideZone,p.guideSection,META.categories[p.category],p.rawCategory,p.description,p.excerpt,...(p.guideTexts||[]).flatMap(t=>t.paragraphs)].join(' ')));NAME_SEARCH.set(p.id,normalize(p.name+' '+p.guideZone+' '+p.region));}
let personal={notes:{}}, favorites=new Set(), filtered=[],visibleLimit=45,selected=null,lastFocus=null,toastTimer=null;
const state={q:'',region:'',category:'',zone:'',guide:'',importance:'',status:'all',sort:'importance',favorites:false};
const geoLabel=p=>p.verification==='segnalata'?'Posizione segnalata (non verificata)':p.lat===null?'Non localizzata':p.verification==='approssimata'?'Posizione approssimativa':p.verification==='da_guida'?(p.coordinateRole==='area'?'Area dalla guida':'Coordinate dalla guida'):p.coordinateRole==='area'?'Area riscontrata':p.coordinateRole==='localita'?'Localit\u00e0 riscontrata':'Sito riscontrato';
function matchesGeoStatus(){return true;} 
function toast(msg){$('#toast').textContent=msg;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4300);}
// Shared UI: the public board is loaded from the server; no old local backup is read.
const cloud = new AtlasCloud(window.ATLAS_CLOUD_CONFIG || {});
const noteDrafts = new Map(), placeCloudCache = new Map(), pendingFavorites = new Set();
let cloudRefreshSelected = null;
function favoriteState(id){
 return (BYID.get(id)?.communityPlace ? community.favoriteSummary : cloud.summary).get(id);
}
function rebuildFavoriteIndex(){
 favorites=new Set([...cloud.summary.entries(),...community.favoriteSummary.entries()]
  .filter(([,value])=>Number(value.favorite_count)>0).map(([id])=>id));
}
function sharedFavoriteHTML(p) {
 const own=Boolean(favoriteState(p.id)?.mine), count=Number(favoriteState(p.id)?.favorite_count||0);
 return `<button class="fav ${own?'saved':count?'community-saved':''}" aria-label="${own?'Rimuovi il tuo preferito':'Segnala tra i preferiti condivisi'}: ${esc(p.name)}" aria-pressed="${own}" title="${count?'Presente nei preferiti condivisi. ':''}${own?'Hai segnalato questo luogo.':'Aggiungi la tua segnalazione.'}" ${pendingFavorites.has(p.id)?'disabled':''}>${icon('star')}</button>`;
}
async function toggleFav(id){
 if(pendingFavorites.has(id))return;
 if(!cloud.configured){favoriteFeedback.set(id,{message:'Salvataggio online non configurato.',type:'error'});renderList(false);if(selected===id)updateDetailFav();toast('Salvataggio online non configurato: conserva o compila cloud-config.js.');return;}
 pendingFavorites.add(id);favoriteFeedback.set(id,{message:'Salvataggio in corso...',type:'pending'});renderList(false);if(selected===id)updateDetailFav();
 try{
  const own=Boolean(favoriteState(id)?.mine);
  if(BYID.get(id)?.communityPlace)await community.favorite(id.slice(5),!own);
  else await cloud.favorite(id,!own);
  favoriteFeedback.set(id,{message:own?'La tua stella è stata rimossa.':'Preferito salvato sul sito.',type:'success'});
 }
 catch(e){favoriteFeedback.set(id,{message:cloud.errorText(e),type:'error'});toast(cloud.errorText(e));}
 finally{pendingFavorites.delete(id);renderList(false);if(selected===id)updateDetailFav();}
}
function updateDetailFav(){
 const b=$('#detail-fav');if(!b)return;
 const s=favoriteState(selected),own=Boolean(s?.mine),shared=Number(s?.favorite_count||0)>0;
 b.innerHTML=icon('star')+(own?'Rimuovi la mia stella':'Segnala preferito');
 b.setAttribute('aria-pressed',String(own));b.classList.toggle('active',own);b.disabled=pendingFavorites.has(selected);
 const hint=$('#shared-favorite-state');if(hint)hint.textContent=favoriteFeedback.get(selected)?.message||(shared?(own?'Questo luogo \u00e8 nella raccolta comune, anche grazie alla tua segnalazione.':'Questo luogo \u00e8 gi\u00e0 nella raccolta comune. Puoi aggiungere la tua segnalazione.'):'Nessuna segnalazione nella raccolta comune.');
}
function sharedNoteSection(id){
 return `<section class="shared-notes" aria-labelledby="shared-notes-title"><h3 class="section-title" id="shared-notes-title">Note condivise</h3><p class="shared-copy">Le note pubblicate sono visibili a chiunque apra il sito. Non inserire dati riservati.</p><div id="shared-note-list" aria-live="polite"><p class="shared-muted">${cloud.configured?'Caricamento delle note...':'Collega l\u2019archivio online per leggere e pubblicare note.'}</p></div><button id="more-shared-notes" class="btn" hidden>Altre note</button><div class="shared-editor"><label for="personal-note">La tua nota pubblica</label><textarea id="personal-note" maxlength="4000" placeholder="Scrivi una nota sul luogo. Diventer\u00e0 visibile dopo la pubblicazione." aria-label="La tua nota pubblica" disabled></textarea><small id="note-state" role="status">${cloud.configured?'In attesa dell\u2019archivio.':'Salvataggio online non ancora configurato.'}</small><div class="shared-editor-actions"><button id="publish-note" class="btn primary" disabled>Pubblica nota</button><button id="reload-note" class="btn" hidden>Ricarica dal sito</button></div><p class="shared-muted">Puoi modificare o rimuovere la tua nota da questo browser. Per rimuoverla, svuota il campo e salva.</p></div></section>`;
}
function noteRowsHTML(rows){
 if(!rows.length)return '<p class="shared-muted">Nessuna nota pubblicata per questo luogo.</p>';
 return rows.map(n=>`<article class="shared-note"><div class="shared-note-meta"><strong>${n.is_own?'Da questo browser':'Visitatore'}</strong><time datetime="${esc(n.updated_at)}">${esc(new Date(n.updated_at).toLocaleString('it-IT',{dateStyle:'medium',timeStyle:'short'}))}</time></div><p>${esc(n.body)}</p></article>`).join('');
}
async function loadSharedPlace(id, append=false){
 if(!cloud.configured)return;
 const prior=placeCloudCache.get(id),offset=append?(prior?.notes.length||0):0;
 try{
  const r=await cloud.place(id,offset);
  if(append&&prior)r.notes=[...prior.notes,...r.notes.filter(n=>!prior.notes.some(x=>x.id===n.id))];
  placeCloudCache.set(id,r);personal.notes[id]=r.own_note||'';
  if(selected!==id)return;
  $('#shared-note-list').innerHTML=noteRowsHTML(r.notes);
  const more=$('#more-shared-notes');more.hidden=r.notes.length>=r.note_count;more.onclick=()=>loadSharedPlace(id,true);
  let draft=noteDrafts.get(id);
  if(!draft||!draft.dirty){draft={body:r.own_note||'',version:r.own_version,dirty:false,saving:false};noteDrafts.set(id,draft);$('#personal-note').value=draft.body;}
  updateNoteEditor(id);
  if(!draft.dirty)$('#note-state').textContent=r.own_note?'Nota pubblicata sul sito.':'Nessuna tua nota pubblicata per questo luogo.';
 }catch(e){if(selected===id){$('#shared-note-list').innerHTML='<p class="shared-muted">'+esc(cloud.errorText(e))+'</p>';$('#note-state').textContent='Impossibile verificare la nota sul sito. Aggiorna prima di modificare.';$('#publish-note').disabled=true;$('#reload-note').hidden=false;}}
}
function updateNoteEditor(id){
 if(selected!==id)return;
 const d=noteDrafts.get(id),r=placeCloudCache.get(id),button=$('#publish-note');if(!button)return;
 button.disabled=!cloud.configured||!d||!r||!d.dirty||d.saving;
 button.textContent=d?.saving?'Salvataggio in corso...':r?.own_note?(d?.body.trim()?'Salva modifiche':'Rimuovi la mia nota'):'Pubblica nota';
 $('#personal-note').disabled=!cloud.configured||Boolean(d?.saving);
}
function bindSharedPlace(id){
 const input=$('#personal-note'),cached=noteDrafts.get(id);
 if(cached)input.value=cached.body;
 input.oninput=()=>{
  const r=placeCloudCache.get(id);if(!r)return;
  let d=noteDrafts.get(id)||{body:r.own_note,version:r.own_version};
  d.body=input.value;d.dirty=d.body.trim()!==(r.own_note||'');noteDrafts.set(id,d);
  $('#note-state').textContent=d.dirty?'Modifiche non pubblicate. Premi il pulsante per salvarle sul sito.':'Nessuna modifica da pubblicare.';updateNoteEditor(id);
 };
 $('#publish-note').onclick=()=>publishNote(id);
 $('#reload-note').onclick=()=>{
  const d=noteDrafts.get(id);if(d?.dirty&&!confirm('Scartare le modifiche non pubblicate e caricare la nota dal sito?'))return;
  noteDrafts.delete(id);$('#reload-note').hidden=true;loadSharedPlace(id);
 };
 loadSharedPlace(id);
}
async function publishNote(id){
 const d=noteDrafts.get(id);if(!d||!d.dirty||d.saving)return;
 const sent=d.body.trim();d.saving=true;updateNoteEditor(id);$('#note-state').textContent='Invio al server...';
 try{
  const r=await cloud.note(id,sent,d.version);
  d.body=r.body;d.version=r.version;d.dirty=false;d.saving=false;
  if(selected===id){$('#personal-note').value=r.body;$('#note-state').textContent=r.body?'Nota pubblicata sul sito.':'La tua nota \u00e8 stata rimossa dal sito.';$('#reload-note').hidden=true;}
  toast(r.body?'Nota pubblicata sul sito.':'La tua nota \u00e8 stata rimossa.');
  await loadSharedPlace(id);
 }catch(e){d.saving=false;if(selected===id){$('#note-state').textContent=cloud.errorText(e);$('#reload-note').hidden=false;}toast(cloud.errorText(e));}
 finally{d.saving=false;updateNoteEditor(id);}
}
function setupSharedUI(){
 cloud.subscribe(()=>{
  rebuildFavoriteIndex();
  if(state.favorites){candidates=computeCandidates();filtered=computeFiltered();sortFiltered();}
  renderList(false);atlas.draw();updateDetailFav();
  if(selected&&!BYID.get(selected)?.communityPlace&&cloud.state==='ready'&&!noteDrafts.get(selected)?.saving){clearTimeout(cloudRefreshSelected);cloudRefreshSelected=setTimeout(()=>{if(selected)loadSharedPlace(selected);},250);}
 });
 addEventListener('beforeunload',e=>{if([...noteDrafts.values()].some(d=>d.dirty||d.saving)){e.preventDefault();e.returnValue='';}});
 cloud.refresh().catch(()=>{});
}

// Viewport catalogue: map extent is mandatory, global search can move the camera.
const NAME_SEARCH=new Map();
BASE_PLACES.forEach(indexPlace);
let candidates=PLACES,searchSuggestions=[],searchIndex=-1,searchTimer=null;
const favoriteFeedback=new Map();
const SIDEBAR_STORAGE_KEY='francia-atlante-sidebar-v7';
let sidebarWidth=380,sidebarCollapsed=false,sidebarDrag=null;
function sidebarMaximum(){return Math.max(280,Math.min(680,innerWidth-360));}
function persistSidebar(){try{localStorage.setItem(SIDEBAR_STORAGE_KEY,JSON.stringify({width:sidebarWidth,collapsed:sidebarCollapsed}));}catch{}}
function applySidebar(){
 const width=Math.max(280,Math.min(sidebarMaximum(),sidebarWidth));
 document.documentElement.style.setProperty('--sidebar-width',width+'px');
 const desktop=innerWidth>760;
 document.body.classList.toggle('sidebar-collapsed',desktop&&sidebarCollapsed);
 const mobileMap=!desktop&&document.body.classList.contains('map-view');
 $('#sidebar').inert=(desktop&&sidebarCollapsed)||mobileMap;
 $('.map-shell').inert=!desktop&&!mobileMap;
 const r=$('#sidebar-resizer');r.setAttribute('aria-valuenow',String(Math.round(width)));r.setAttribute('aria-valuemax',String(sidebarMaximum()));r.tabIndex=sidebarCollapsed?-1:0;
 const b=$('#sidebar-toggle');b.setAttribute('aria-expanded',String(!sidebarCollapsed));
 b.setAttribute('aria-label',sidebarCollapsed?'Apri elenco dei luoghi':'Richiudi elenco dei luoghi');
 b.title=sidebarCollapsed?'Apri elenco':'Richiudi elenco';b.innerHTML=icon(sidebarCollapsed?'chevron-right':'chevron-left');
}
function setSidebarCollapsed(value){sidebarCollapsed=Boolean(value);applySidebar();persistSidebar();}
function setupSidebar(){
 try{const saved=JSON.parse(localStorage.getItem(SIDEBAR_STORAGE_KEY)||'null');if(saved&&Number.isFinite(saved.width))sidebarWidth=Math.max(280,Math.min(680,saved.width));sidebarCollapsed=saved?.collapsed===true;}catch{}
 applySidebar();
 const r=$('#sidebar-resizer');
 r.addEventListener('pointerdown',e=>{if(e.button!==0||innerWidth<=760)return;e.preventDefault();sidebarDrag={pointer:e.pointerId,x:e.clientX,width:$('#sidebar').getBoundingClientRect().width};r.setPointerCapture(e.pointerId);document.body.classList.add('sidebar-resizing');});
 r.addEventListener('pointermove',e=>{if(!sidebarDrag||e.pointerId!==sidebarDrag.pointer)return;sidebarWidth=Math.max(280,Math.min(sidebarMaximum(),sidebarDrag.width+e.clientX-sidebarDrag.x));applySidebar();});
 const end=e=>{if(!sidebarDrag||e.pointerId!==sidebarDrag.pointer)return;sidebarDrag=null;document.body.classList.remove('sidebar-resizing');persistSidebar();};
 r.addEventListener('pointerup',end);r.addEventListener('pointercancel',end);r.addEventListener('lostpointercapture',end);
 r.addEventListener('dblclick',()=>{sidebarWidth=380;applySidebar();persistSidebar();});
 r.addEventListener('keydown',e=>{let w=sidebarWidth;const step=e.shiftKey?50:15;if(e.key==='ArrowLeft')w-=step;else if(e.key==='ArrowRight')w+=step;else if(e.key==='Home')w=280;else if(e.key==='End')w=sidebarMaximum();else return;e.preventDefault();sidebarWidth=Math.max(280,Math.min(sidebarMaximum(),w));applySidebar();persistSidebar();});
 $('#sidebar-toggle').onclick=()=>setSidebarCollapsed(!sidebarCollapsed);
 addEventListener('resize',applySidebar);
}
function hideSuggestions(){clearTimeout(searchTimer);$('#search-suggestions').hidden=true;$('#search').setAttribute('aria-expanded','false');$('#search').removeAttribute('aria-activedescendant');searchIndex=-1;}
function setSuggestionIndex(index){
 if(!searchSuggestions.length)return;
 searchIndex=(index+searchSuggestions.length)%searchSuggestions.length;
 $$('#suggestion-items .search-result').forEach((b,i)=>{b.classList.toggle('active',i===searchIndex);b.setAttribute('aria-selected',String(i===searchIndex));});
 const b=$('#suggestion-'+searchIndex);$('#search').setAttribute('aria-activedescendant',b.id);b.scrollIntoView({block:'nearest'});
}
function renderSuggestions(){
 const q=normalize($('#search').value);if(q.length<2){hideSuggestions();return;}
 const tokens=q.split(' '),rank=p=>normalize(p.name)===q?0:normalize(p.name).startsWith(q)?1:normalize(p.name).includes(q)?2:3;
 searchSuggestions=PLACES.filter(p=>!hiddenPlaces.has(p.id)&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&tokens.every(t=>NAME_SEARCH.get(p.id).includes(t))).sort((a,b)=>rank(a)-rank(b)||prominenceOrder(a,b)).slice(0,9);
 searchIndex=-1;const list=$('#suggestion-items');list.replaceChildren();
 for(const [i,p]of searchSuggestions.entries()){
  const b=document.createElement('button');b.className='search-result';b.id='suggestion-'+i;b.type='button';b.role='option';b.setAttribute('aria-selected','false');b.tabIndex=-1;
  b.innerHTML=icon(p.category)+`<span><strong>${esc(p.name)}</strong><small>${esc(p.guideZone)} &middot; ${esc(p.region)}</small></span>`;
  b.onclick=()=>selectSearchResult(p.id);list.append(b);
 }
 if(!searchSuggestions.length){const p=document.createElement('p');p.className='search-no-match';p.textContent='Nessun nome corrispondente nel catalogo. L\u2019elenco cerca anche nelle descrizioni dell\u2019area visibile.';list.append(p);}
 $('#search-suggestions').hidden=false;$('#search').setAttribute('aria-expanded','true');
}
function selectSearchResult(id){
 const p=BYID.get(id);if(!p)return;
 hideSuggestions();state.q='';$('#search').value='';$('#clear-search').hidden=true;
 // A global result must not be hidden by incompatible local filters.
 let changed=false;
 for(const k of ['region','category','zone','guide','importance']){
  const compatible=k==='region'?p.region===state[k]:k==='category'?p.category===state[k]:k==='zone'?p.guideZone===state[k]:k==='guide'?p.sources.some(s=>s.guide===state[k]):importanceLevel(p)>=Number(state[k]);
  if(state[k]&&!compatible){state[k]='';$('#'+k).value='';changed=true;}
 }
 if(state.favorites&&!favorites.has(id)){state.favorites=false;$('#favorites-only').checked=false;changed=true;}
 setSidebarCollapsed(false);if(innerWidth<=760)setMobileView(true);
 atlas.centerOn(p.lon,p.lat,p.coordinateRole==='sito'?13:11);applyFilters();openDetail(id);
 if(changed)toast('Ricerca globale: rimossi i filtri che escludevano questo luogo.');
}

function initControls(){
 for(const r of [...new Set(PLACES.map(p=>p.region))].sort((a,b)=>a.localeCompare(b,'it')))$('#region').add(new Option(r,r));
 for(const[k,v]of Object.entries(META.categories)){$('#category').add(new Option(v,k));$('#edit-category').add(new Option(v,k));}
 for(const z of [...new Set(PLACES.map(p=>p.guideZone))].sort((a,b)=>a.localeCompare(b,'it')))$('#zone').add(new Option(z,z));
 $('#search').addEventListener('input',()=>{state.q=normalize($('#search').value);$('#clear-search').hidden=!state.q;applyFilters();clearTimeout(searchTimer);searchTimer=setTimeout(renderSuggestions,150);});
 $('#search').addEventListener('focus',()=>{if(state.q.length>=2)renderSuggestions();});
 $('#search').addEventListener('keydown',e=>{
  if(e.key==='Escape'){hideSuggestions();e.stopPropagation();return;}
  if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if($('#search-suggestions').hidden)renderSuggestions();setSuggestionIndex(searchIndex<0?(e.key==='ArrowDown'?0:searchSuggestions.length-1):searchIndex+(e.key==='ArrowDown'?1:-1));}
  if(e.key==='Enter'&&!$('#search-suggestions').hidden&&searchSuggestions.length){e.preventDefault();selectSearchResult(searchSuggestions[Math.max(0,searchIndex)].id);}
  if(e.key==='Tab')hideSuggestions();
 });
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('.searchbox'))hideSuggestions();});
 $('#clear-search').onclick=()=>{$('#search').value='';state.q='';$('#clear-search').hidden=true;hideSuggestions();applyFilters();$('#search').focus();};
 for(const key of ['region','category','zone','guide','sort','importance'])$('#'+key).onchange=()=>{state[key]=$('#'+key).value;hideSuggestions();applyFilters();};
 $('#favorites-only').onchange=()=>{state.favorites=$('#favorites-only').checked;applyFilters();};
 $('#filter-btn').onclick=()=>{const a=$('#advanced');a.hidden=!a.hidden;$('#filter-btn').setAttribute('aria-expanded',String(!a.hidden));$('#filter-btn').classList.toggle('active',!a.hidden);};
 $('#reset').onclick=reset;
 $('#export-btn').onclick=()=>$('#export-dialog').showModal();
 $$('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());
 $$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
 $('#view-list').onclick=()=>setMobileView(false);$('#view-map').onclick=()=>setMobileView(true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$$('dialog[open]').length)closeDetail();if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();setSidebarCollapsed(false);setMobileView(false);$('#search').focus();}});
}
function reset(){
 for(const k of ['q','region','category','zone','guide','importance'])state[k]='';state.status='all';state.sort='importance';state.favorites=false;
 $('#search').value='';$('#clear-search').hidden=true;hideSuggestions();
 for(const k of ['region','category','zone','guide','sort','importance'])$('#'+k).value=state[k];
 $('#favorites-only').checked=false;applyFilters();
}
function computeCandidates(){const tokens=state.q.split(' ').filter(Boolean);return PLACES.filter(p=>!hiddenPlaces.has(p.id)&&(!tokens.length||tokens.every(t=>SEARCH.get(p.id).includes(t)))&&(!state.region||p.region===state.region)&&(!state.category||p.category===state.category)&&(!state.zone||p.guideZone===state.zone)&&(!state.guide||p.sources.some(s=>s.guide===state.guide))&&(!state.importance||importanceLevel(p)>=Number(state.importance))&&(!state.favorites||favorites.has(p.id))); }
function computeFiltered(){return candidates.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&atlas.contains(p.lon,p.lat));}
function distanceKm(a,b){const r=Math.PI/180,dl=(b.lon-a.lon)*r,dp=(b.lat-a.lat)*r,h=Math.sin(dp/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dl/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(h)));}
function sortFiltered(){filtered.sort((a,b)=>state.sort==='name'?(a.name.localeCompare(b.name,'it')||a.id.localeCompare(b.id)):state.sort==='region'?(a.region.localeCompare(b.region,'it')||prominenceOrder(a,b)):prominenceOrder(a,b));}
function applyFilters(){candidates=computeCandidates();refreshViewport(true);}
function refreshViewport(scroll=true){
 const previous=filtered.map(p=>p.id).join('|');filtered=computeFiltered();sortFiltered();
 if(scroll)visibleLimit=45;
 renderList(scroll&&previous!==filtered.map(p=>p.id).join('|'));atlas.draw();
}
function renderList(scroll=false){
 const list=$('#results'),scrollTop=list.scrollTop,focus=document.activeElement,focusID=focus?.closest('.place-card')?.dataset.id,focusType=focus?.classList.contains('fav')?'fav':'card-main';
 list.replaceChildren();
 if(!filtered.length){list.innerHTML=`<div class="empty">${icon('search')}<strong>Nessun luogo in quest\u2019area</strong><p>Sposta la mappa, riduci lo zoom o modifica i filtri. La ricerca per nome trova luoghi in tutta la Francia.</p><button class="btn" id="empty-reset">Azzera i filtri</button></div>`;$('#empty-reset').onclick=reset;return;}
 const frag=document.createDocumentFragment();
 for(const p of filtered.slice(0,visibleLimit)){
  const card=document.createElement('article');card.className='place-card'+(p.id===selected?' selected':'');card.dataset.id=p.id;card.style.setProperty('--cat',COLORS[p.category]);
  const feedback=favoriteFeedback.get(p.id);
  card.innerHTML=`<button class="card-main" aria-label="Apri ${esc(p.name)}"><span class="category-icon">${icon(p.category)}</span><span class="cardtext"><span class="card-name">${esc(p.name)}</span><span class="card-zone">${esc(p.region)} &middot; ${esc(p.guideZone)}</span><span class="card-meta"><span class="card-prominence level-${importanceLevel(p)}">${importanceLabel(p)}</span><span class="badge ${p.verification==='approssimata'?'approximate':p.verification==='da_guida'?'from-guide':''}">${geoLabel(p)}</span></span>${feedback?`<span class="favorite-feedback ${esc(feedback.type)}" role="status">${esc(feedback.message)}</span>`:''}</span></button>${sharedFavoriteHTML(p)}`;
  card.querySelector('.card-main').onclick=()=>openDetail(p.id);card.querySelector('.fav').onclick=()=>toggleFav(p.id);frag.append(card);
 }
 list.append(frag);
 if(filtered.length>visibleLimit){const b=document.createElement('button');b.className='btn loadmore';b.textContent='Mostra altri luoghi';b.onclick=()=>{visibleLimit+=45;renderList(false);};list.append(b);}
 if(focusID){const card=[...list.querySelectorAll('.place-card')].find(x=>x.dataset.id===focusID);card?.querySelector('.'+focusType)?.focus({preventScroll:true});}
 list.scrollTop=scroll?0:scrollTop;
}
function setMobileView(map){
 document.body.classList.toggle('map-view',map);
 $('#view-list').classList.toggle('active',!map);$('#view-map').classList.toggle('active',map);$('#view-list').setAttribute('aria-pressed',String(!map));$('#view-map').setAttribute('aria-pressed',String(map));
 closeDetail(false);hideSuggestions();
 applySidebar();if(innerWidth<=760)$('#map').tabIndex=map?0:-1;
 requestAnimationFrame(()=>{atlas.resize();atlas.viewChanged();});
}

function guidePassageHTML(t){
 const paragraphs=t.paragraphs.map((p,i)=>{
  const links=(t.paragraphLinks?.[i]||[]).filter(link=>safeURL(link.url));
  const websites=links.length?`<div class="guide-websites">${links.map(link=>`<a href="${esc(safeURL(link.url))}" target="_blank" rel="noopener noreferrer">${esc(link.label||link.url)} ${icon('arrow')}</a>`).join('<br>')}</div>`:'';
  return (t.paragraphHeadings?.[i]?`<h4>${esc(t.paragraphHeadings[i])}</h4>`:'')+`<p>${esc(p)}</p>`+websites;
 }).join('');
 return `<article class="guide-passage" lang="${esc(t.language)}"><div class="original-text">${paragraphs}</div></article>`;
}
function passageListHTML(p){const texts=[...(p.guideTexts||[])].sort((a,b)=>(a.language!=='it')-(b.language!=='it'));return texts[0]?guidePassageHTML(texts[0]):p.description?'<p class="community-description">'+esc(p.description)+'</p>':'<p>Descrizione non disponibile.</p>';}
function openReader(id){const p=BYID.get(id);if(!p)return;$('#reader-title').textContent=p.name;$('#reader-content').innerHTML=passageListHTML(p);$('#reader-dialog').showModal();$('#reader-dialog').scrollTop=0;}
function openDetail(id){
 const p=BYID.get(id);if(!p)return;lastFocus=document.activeElement;selected=id;const d=$('#detail');d.hidden=false;d.style.setProperty('--cat',COLORS[p.category]);
 const approximate=p.verification==='approssimata',a=p.approximation||{};
 let geo;
 if(approximate){
  const scope={comune:'comune o localit\u00e0',zona:'zona o area estesa',sito:'dintorni del sito'}[a.scope]||'zona';
  geo=`<div class="geo-block approximate"><div class="geo-title">${icon('pin')}Posizione approssimativa</div><p class="reference">Riferimento: <strong>${esc(a.reference||p.guideSection)}</strong></p><p class="geo-warning">Il punto indica la zona, non un ingresso o un parcheggio. Pi\u00f9 luoghi possono condividere le stesse coordinate.</p><details><summary>Come \u00e8 stato scelto il punto</summary><p>${esc(a.method)}. Ambito: ${esc(scope)}.</p><code>${p.lat.toFixed(p.id.startsWith('fr-')?2:3)}, ${p.lon.toFixed(p.id.startsWith('fr-')?2:3)} (indicative)</code><p>Stima: ${esc(p.geoEstimated)}. Margine di errore non misurato.</p>${p.geoSource?`<a href="${esc(safeURL(p.geoSource))}" target="_blank" rel="noopener noreferrer">Fonte del riferimento comunale ${icon('arrow')}</a>`:''}</details></div>`;
 }else if(p.verification==='segnalata'){
  const placedOnAtlas=isAtlasPinURL(p.geoSource);
  geo=`<div class="geo-block reported"><div class="geo-title">${icon('pin')}Posizione segnalata dagli utenti</div><p>${placedOnAtlas?'Punto selezionato sulla mappa dell’atlante.':'Coordinate proposte da un visitatore.'} Posizione non verificata editorialmente.</p><code>${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}</code><a href="${esc(safeURL(p.geoSource))}" target="_blank" rel="noopener noreferrer">${placedOnAtlas?'Apri il punto su Google Maps':'Apri il riferimento Google Maps'} ${icon('arrow')}</a>${p.geoChecked?`<p>Segnalazione: ${esc(p.geoChecked.slice(0,10))}</p>`:''}</div>`;
 }else if(p.verification==='da_guida'){
  const explanation=p.coordinateRole==='area'?'Punto rappresentativo dell\u2019area indicata nella guida.':'Punto associato al luogo nella guida.';
  geo=`<div class="geo-block from-guide"><div class="geo-title">${icon('pin')}${geoLabel(p)}</div><p>${explanation} Nessun controllo esterno attuale; non certifica ingresso o parcheggio.</p><details><summary>Coordinate e provenienza</summary><code>${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}</code><p class="geo-source-note">${esc(p.geoSourceName)}. Coordinate recuperate dal collegamento geografico dell\u2019EPUB il ${esc(p.geoRecovered)}; nomi e contesto confrontati con il catalogo. La precisione effettiva non \u00e8 misurata.</p></details></div>`;
 }else{
  const explanation=p.coordinateRole==='localita'?'Riferimento del comune o del borgo; non un parcheggio.':p.coordinateRole==='area'?'Punto rappresentativo di un\u2019area estesa; non un accesso stradale.':'Coordinata del sito; accesso e parcheggio non verificati.';
  geo=`<div class="geo-block"><div class="geo-title">${icon('check')}${geoLabel(p)}</div><p>${explanation}</p><details><summary>Coordinate e fonte del riscontro</summary><code>${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}</code><a href="${esc(safeURL(p.geoSource))}" target="_blank" rel="noopener noreferrer">${esc(p.geoSourceName)} ${icon('arrow')}</a><p>Riscontro documentale: ${esc(p.geoChecked)}. ${esc(p.geoMethod||'Coordinate pubblicate nella fonte indicata.')} Non implica verifica degli accessi.</p></details></div>`;
 }
 const link=p.verification==='segnalata'?safeURL(p.geoSource):approximate?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name+' '+(a.reference||p.guideSection)+' France')}`:`https://www.google.com/maps/search/?api=1&query=${p.lat}%2C${p.lon}`;
 d.innerHTML=`<div class="detail-top"><div class="detail-cat">${icon(p.category)}${esc(META.categories[p.category])}</div><button class="btn iconbtn detail-close" id="close-detail" aria-label="Chiudi scheda">${icon('close')}</button><h2>${esc(p.name)}</h2><p class="detail-area">${esc(p.region)} &middot; ${esc(p.guideSection)}</p>${importanceLevel(p)>1?`<span class="prominence-chip" title="Richiamo editoriale riconosciuto nelle guide, non una valutazione a stelle">${importanceLabel(p)}</span>`:''}</div><div class="detail-body">${geo}<div class="detail-actions"><a class="btn primary map-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${icon('arrow')}${approximate?'Cerca il luogo su Maps':'Apri su Maps'}</a><button class="btn" id="detail-fav">${icon('star')}Preferito</button></div><p id="shared-favorite-state" class="shared-muted" role="status"></p><div class="edit-place-actions"><button type="button" class="btn" id="report-position">${icon('pin')}Segnala posizione</button><button type="button" class="btn" id="hide-place">${icon('minus')}Nascondi per me</button>${p.communityPlace&&community.currentUserId===p.createdBy?`<button type="button" class="btn danger-outline" id="delete-community-place">Elimina il mio luogo</button>`:''}${p.latestCorrection?.created_by===community.currentUserId?`<button type="button" class="btn quiet-btn" id="withdraw-position">Ritira la mia segnalazione</button>`:''}</div><section class="guide-text-section"><div class="guide-text-top"><h3>Descrizione</h3>${p.communityPlace?'':`<button class="btn" id="read-wide">${icon('list')}Lettura ampia</button>`}</div>${passageListHTML(p)}</section>${p.communityPlace?'':sharedNoteSection(id)}<h3 class="section-title">Altri luoghi nei dintorni</h3><div class="nearby" id="related"></div></div>`;
 $('#close-detail').onclick=()=>closeDetail();
 $('#detail-fav').onclick=()=>toggleFav(id);
 updateDetailFav();
 if(!p.communityPlace){$('#read-wide').onclick=()=>openReader(id);bindSharedPlace(id);}
 $('#report-position').onclick=()=>openPlaceEditor('correction',id);
 $('#hide-place').onclick=()=>hidePlace(id);
 if($('#delete-community-place'))$('#delete-community-place').onclick=()=>removeMyPlace(p);
 if($('#withdraw-position'))$('#withdraw-position').onclick=()=>withdrawMyCorrection(p);
 const related=PLACES.filter(r=>r.id!==id&&!hiddenPlaces.has(r.id)&&r.lat!==null).sort((a,b)=>distanceKm(p,a)-distanceKm(p,b)||a.name.localeCompare(b.name,'it')).slice(0,8);for(const r of related){const b=document.createElement('button');b.textContent=r.name;b.onclick=()=>openDetail(r.id);$('#related').append(b);}if(!related.length)$('#related').textContent='Nessun altro luogo nei dintorni.';
 d.scrollTop=0;renderList(false);if(!atlas.contains(p.lon,p.lat))atlas.centerOn(p.lon,p.lat,Math.max(atlas.zoom,10));else atlas.draw();$('#close-detail').focus({preventScroll:true});
}
function closeDetail(focus=true){if($('#detail').hidden)return;$('#detail').hidden=true;selected=null;renderList(false);atlas.draw();if(focus&&lastFocus&&lastFocus.isConnected)lastFocus.focus({preventScroll:true});}
/* Web Mercator renderer. MapTiler is the only basemap; requests cover the viewport. */
class Atlas{
 constructor(){this.el=$('#map');this.canvas=$('#map-canvas');this.ctx=this.canvas.getContext('2d');this.zoom=5;this.center=this.project(2.4,46.3);this.width=1000;this.height=750;this.mode='maptiler';this.tileCache=new Map();this.tileErrors=0;this.tileLoaded=0;this.tileTimer=null;this.pointers=new Map();this.drag=null;this.pinch=null;this.frame=0;this.grid=[];this.wheelTimer=null;this.bind();this.resize();}
 project(lon,lat){const phi=Math.max(-85,Math.min(85,lat))*Math.PI/180;return{x:(lon+180)/360*256,y:(.5-Math.log(Math.tan(Math.PI/4+phi/2))/(2*Math.PI))*256};}
 unproject(x,y){return{lon:x/256*360-180,lat:(2*Math.atan(Math.exp((.5-y/256)*2*Math.PI))-Math.PI/2)*180/Math.PI};}
 point(lon,lat){const p=this.project(lon,lat),s=2**this.zoom;return{x:(p.x-this.center.x)*s+this.width/2,y:(p.y-this.center.y)*s+this.height/2};}
 contains(lon,lat){const p=this.point(lon,lat);return p.x>=0&&p.x<=this.width&&p.y>=0&&p.y<=this.height;}
 resize(){const r=this.el.getBoundingClientRect();if(r.width<1||r.height<1)return;const changed=Math.abs(this.width-r.width)>.2||Math.abs(this.height-r.height)>.2;this.width=r.width;this.height=r.height;const d=Math.min(window.devicePixelRatio||1,2);this.canvas.width=Math.round(this.width*d);this.canvas.height=Math.round(this.height*d);this.canvas.style.width=this.width+'px';this.canvas.style.height=this.height+'px';this.ctx.setTransform(d,0,0,d,0,0);this.draw();if(changed)this.viewChanged();}
 centerOn(lon,lat,zoom){this.center=this.project(lon,lat);this.zoom=Math.max(4,Math.min(17,zoom));this.clamp();this.draw();this.viewChanged();}
 fit(points){if(!points.length)return;const ps=points.map(p=>this.project(p.lon,p.lat));let xs=ps.map(p=>p.x),ys=ps.map(p=>p.y);const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);this.center={x:(minX+maxX)/2,y:(minY+maxY)/2};if(points.length===1)this.zoom=10;else this.zoom=Math.max(4,Math.min(12,Math.log2(Math.min(Math.max(150,this.width-(this.width<600?50:180))/Math.max(.008,maxX-minX),Math.max(150,this.height-110)/Math.max(.008,maxY-minY)))));this.clamp();this.draw();this.viewChanged();}
 clamp(){const nw=this.project(-11,55),se=this.project(14,39);this.center.x=Math.max(nw.x,Math.min(se.x,this.center.x));this.center.y=Math.max(nw.y,Math.min(se.y,this.center.y));}
 zoomBy(delta,x=this.width/2,y=this.height/2){const old=2**this.zoom,newZ=Math.max(4,Math.min(17,this.zoom+delta)),now=2**newZ;this.center.x+=(x-this.width/2)*(1/old-1/now);this.center.y+=(y-this.height/2)*(1/old-1/now);this.zoom=newZ;this.clamp();this.draw();this.viewChanged();}
 viewChanged(){clearTimeout(this.wheelTimer);this.wheelTimer=setTimeout(()=>{if(!this.drag&&!sidebarDrag)refreshViewport(true);else this.viewChanged();},180);}
 bind(){
  new ResizeObserver(()=>this.resize()).observe(this.el);
  this.el.addEventListener('wheel',e=>{e.preventDefault();const r=this.el.getBoundingClientRect();this.zoomBy(e.deltaY>0?-.3:.3,e.clientX-r.left,e.clientY-r.top);},{passive:false});
  this.el.addEventListener('dblclick',e=>{if(e.target.closest('button'))return;const r=this.el.getBoundingClientRect();this.zoomBy(1,e.clientX-r.left,e.clientY-r.top);});
  this.el.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;this.el.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(locationPicker)this.pickStart=this.pointers.size===1?{id:e.pointerId,x:e.clientX,y:e.clientY}:null;this.drag={x:e.clientX,y:e.clientY,center:{...this.center}};this.el.classList.add('dragging');if(this.pointers.size===2){const [a,b]=[...this.pointers.values()];this.pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:this.zoom};}});
  this.el.addEventListener('pointermove',e=>{if(!this.pointers.has(e.pointerId))return;this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(this.pointers.size===2&&this.pinch){const[a,b]=[...this.pointers.values()];this.zoom=Math.max(4,Math.min(17,this.pinch.zoom+Math.log2(Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))/this.pinch.distance)));}else if(this.drag){const s=2**this.zoom;this.center={x:this.drag.center.x-(e.clientX-this.drag.x)/s,y:this.drag.center.y-(e.clientY-this.drag.y)/s};}this.clamp();this.draw();});
  const end=e=>{const choose=Boolean(locationPicker&&e.type==='pointerup'&&this.pickStart?.id===e.pointerId&&this.pointers.size===1&&Math.hypot(e.clientX-this.pickStart.x,e.clientY-this.pickStart.y)<9);this.pickStart=null;this.pointers.delete(e.pointerId);this.pinch=null;if(this.pointers.size===1){const p=[...this.pointers.values()][0];this.drag={x:p.x,y:p.y,center:{...this.center}};}else{this.drag=null;this.el.classList.remove('dragging');this.viewChanged();}if(choose){const rect=this.el.getBoundingClientRect();chooseLocationAt(e.clientX-rect.left,e.clientY-rect.top);}};
  this.el.addEventListener('pointerup',end);this.el.addEventListener('pointercancel',end);
  this.el.addEventListener('keydown',e=>{if(e.target.closest('button'))return;if(locationPicker&&(e.key==='Enter'||e.key===' ')){e.preventDefault();chooseLocationAt(this.width/2,this.height/2);return;}const s=2**this.zoom;if(e.key==='+'||e.key==='='){this.zoomBy(1);e.preventDefault();}else if(e.key==='-'){this.zoomBy(-1);e.preventDefault();}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();this.center.x+=({'ArrowLeft':-90,'ArrowRight':90}[e.key]||0)/s;this.center.y+=({'ArrowUp':-90,'ArrowDown':90}[e.key]||0)/s;this.clamp();this.draw();this.viewChanged();}});
  $('#zoom-in').onclick=()=>this.zoomBy(1);$('#zoom-out').onclick=()=>this.zoomBy(-1);$('#fit').onclick=()=>{const points=candidates.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));if(points.length)this.fit(points);else toast('Nessun luogo compatibile con i filtri.');};
  // No basemap selector: MapTiler only.
 }
 retryTiles(){
  if(!MAP_CONFIG.maptilerKey){setTileMessage('Configura la chiave pubblica MapTiler in map-config.js.');return;}
  clearTimeout(this.tileTimer);this.tileCache.clear();$('#tiles').replaceChildren();setTileMessage('Caricamento in corso...');this.drawTiles(true);
 }
 armTileCheck(mode){
  clearTimeout(this.tileTimer);this.tileTimer=setTimeout(()=>{
   const current=[...$('#tiles').children],loaded=current.filter(i=>i.dataset.state==='loaded').length;
   if(current.length&&!loaded)setTileMessage('Impossibile caricare le strade. Controlla la connessione, la chiave e i domini autorizzati. Nessuno sfondo alternativo viene attivato.',true);
   else if(current.some(i=>i.dataset.state==='error'))setTileMessage('Alcune porzioni della mappa non sono disponibili.',true);
   else if(current.some(i=>i.dataset.state==='loading'))setTileMessage('Lo sfondo sta impiegando più tempo a caricarsi.',true);
  },10000);
 }
 draw(){
  cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>{
   this.drawBase();this.drawMarkers();renderLocationPin();this.updateScale();
   if(BASEMAPS[this.mode].online){
    // Position cached images while panning; request new viewport tiles only
    // after gestures settle. No area prefetch or offline tile download.
    this.drawTiles(false);clearTimeout(this.tileDrawTimer);
    this.tileDrawTimer=setTimeout(()=>this.drawTiles(true),180);
   }
  });
 }
 drawBase(){const c=this.ctx;c.clearRect(0,0,this.width,this.height);c.fillStyle='#eef0eb';c.fillRect(0,0,this.width,this.height);}
 drawMarkers(){
  const layer=$('#markers'),points=candidates.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(p=>({p,...this.point(p.lon,p.lat)})).filter(v=>v.x>=0&&v.x<=this.width&&v.y>=0&&v.y<=this.height),groups=[];
  points.sort((a,b)=>prominenceOrder(a.p,b.p));
  // A cluster is anchored to its highest-prominence representative, never
  // displaced to create false precision. Its number is a count, not a rating.
  for(const point of points.filter(v=>v.p.id!==selected)){
   const radius=markerSize(importanceLevel(point.p))/2;
   let nearest=null,distance=Infinity;
   for(const g of groups){
    const d=Math.hypot(g.x-point.x,g.y-point.y);
    const threshold=Math.max(this.zoom>13?28:40,g.radius+radius+12);
    if(d<threshold&&d<distance){nearest=g;distance=d;}
   }
   if(nearest)nearest.items.push(point.p);
   else groups.push({x:point.x,y:point.y,items:[point.p],radius});
  }
  const chosen=points.find(v=>v.p.id===selected);if(chosen)groups.push({x:chosen.x,y:chosen.y,items:[chosen.p]});
  const activeId=document.activeElement?.dataset?.mapid,frag=document.createDocumentFragment();
  for(const g of groups){
   const p=g.items[0],level=importanceLevel(p),size=markerSize(level),b=document.createElement('button');
   b.style.left=g.x+'px';b.style.top=g.y+'px';b.style.setProperty('--marker-size',size+'px');b.style.setProperty('--glyph-size',({1:12,2:17,3:22}[level])+'px');b.style.setProperty('--cat',COLORS[p.category]);b.style.setProperty('--prominence-z',String(level+2));
   b.dataset.importance=String(level);b.dataset.representative=p.id;
   if(g.items.length>1){
    const approx=g.items.filter(q=>q.verification==='approssimata').length;
    b.className='marker cluster'+(approx?' has-approximate':'')+(approx===g.items.length?' only-approximate':'');
    b.innerHTML=icon(p.category)+`<span class="cluster-number" aria-hidden="true">${g.items.length}</span>`;
    b.title=`${g.items.length} luoghi. Rilievo massimo: ${importanceLabel(p)} (${p.name}).\n`+g.items.slice(0,18).map(q=>q.name).join('\n')+(g.items.length>18?'\nAltri luoghi nel gruppo.':'');
    b.setAttribute('aria-label',`${g.items.length} luoghi. ${p.name}: ${importanceLabel(p)}. Apri il gruppo.`);
    b.dataset.mapid=g.items.map(q=>q.id).sort().join(',');
    b.onclick=()=>{const same=g.items.every(q=>q.lat===p.lat&&q.lon===p.lon);if(this.zoom<11&&!same)this.fit(g.items);else openCluster(g.items);};
   }else{
    b.className='marker'+(p.coordinateRole==='area'?' area':'')+(p.verification==='approssimata'?' approximate':'')+(p.id===selected?' selected':'');
    b.innerHTML=icon(p.category);b.title=p.name+' - '+importanceLabel(p)+' - '+geoLabel(p);
    b.setAttribute('aria-label',p.name+'; '+importanceLabel(p)+'; '+geoLabel(p));b.dataset.mapid=p.id;b.onclick=()=>openDetail(p.id);
   }
   frag.append(b);
  }
  layer.replaceChildren(frag);
  if(activeId&&document.activeElement===document.body){const el=[...layer.children].find(b=>b.dataset.mapid===activeId);if(el)el.focus({preventScroll:true});}
 }
 drawTiles(loadNew=true){
  if(!MAP_CONFIG.maptilerKey)return;
  const layer=$('#tiles'),mode=this.mode,z=Math.floor(this.zoom),size=256*2**(this.zoom-z),cx=this.center.x*2**this.zoom,cy=this.center.y*2**this.zoom;
  const minX=Math.floor((cx-this.width/2)/size),maxX=Math.floor((cx+this.width/2)/size),minY=Math.floor((cy-this.height/2)/size),maxY=Math.floor((cy+this.height/2)/size),keys=new Set();let requested=false;
  for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){
   if(x<0||y<0||x>=2**z||y>=2**z)continue;
   const key=`${mode}/${z}/${x}/${y}`;keys.add(key);let img=this.tileCache.get(key);
   if(img&&img.dataset.state==='error'&&Date.now()-Number(img.dataset.failedAt||0)>30000){this.tileCache.delete(key);img.remove();img=null;}
   if(!img&&loadNew){
    img=new Image();img.className='tile';img.alt='';img.referrerPolicy='strict-origin-when-cross-origin';img.dataset.key=key;img.dataset.state='loading';img.draggable=false;
    img.onload=()=>{img.dataset.state='loaded';img.style.visibility='visible';if(this.mode===mode){this.tileLoaded++;if([...layer.children].every(t=>t.dataset.state==='loaded'))$('#tile-state').hidden=true;}};
    img.onerror=()=>{img.dataset.state='error';img.style.visibility='hidden';img.dataset.failedAt=String(Date.now());if(this.mode===mode)this.tileErrors++;};
    this.tileCache.set(key,img);img.src=BASEMAPS[mode].url(z,x,y);requested=true;
   }
   if(!img)continue;
   img.style.width=(size+.5)+'px';img.style.height=(size+.5)+'px';img.style.left=(x*size-cx+this.width/2)+'px';img.style.top=(y*size-cy+this.height/2)+'px';if(img.parentNode!==layer)layer.append(img);
  }
  for(const img of [...layer.children])if(!keys.has(img.dataset.key))img.remove();
  if(this.tileCache.size>200){for(const[key,img]of this.tileCache)if(!keys.has(key)){this.tileCache.delete(key);if(this.tileCache.size<=150)break;}}
  if(loadNew&&(requested||[...layer.children].some(i=>i.dataset.state!=='loaded')))this.armTileCheck(mode);
 }
 updateScale(){const lat=this.unproject(this.center.x,this.center.y).lat,mpp=156543.03392*Math.cos(lat*Math.PI/180)/2**this.zoom;const max=110*mpp;const base=10**Math.floor(Math.log10(max));const length=[1,2,5].map(x=>x*base).filter(x=>x<=max).pop()||base/2;$('#scale').style.width=(length/mpp)+'px';$('#scale').textContent=length>=1000?(length/1000)+' km':length+' m';$('#zoom-in').disabled=this.zoom>=17;$('#zoom-out').disabled=this.zoom<=4;$('#attribution').innerHTML=BASEMAPS[this.mode].attribution;}
}
function openCluster(items){$('#cluster-items').replaceChildren();for(const p of [...items].sort(prominenceOrder)){const b=document.createElement('button');b.className='btn';b.innerHTML=icon(p.category)+`<span class="cluster-label">${esc(p.name)}<small class="cluster-prominence">${importanceLabel(p)}</small><span class="badge ${p.verification==='approssimata'?'approximate':p.verification==='da_guida'?'from-guide':''}">${geoLabel(p)}</span></span>`;b.onclick=()=>{$('#cluster-dialog').close();openDetail(p.id);};$('#cluster-items').append(b);}$('#cluster-dialog').showModal();}
function download(name,text,mime='application/json'){const blob=new Blob([text],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function geoJSON(items){return{type:'FeatureCollection',metadata:{version:META.version,note:'approssimata: riferimento indicativo; da_guida: coordinata recuperata dall EPUB, senza controllo esterno attuale; riscontrata: riscontro documentale, non rilievo sul posto. Le aree sono punti rappresentativi.'},features:items.filter(p=>p.lat!==null).map(p=>({type:'Feature',geometry:{type:'Point',coordinates:[p.lon,p.lat]},properties:{id:p.id,name:p.name,category:META.categories[p.category],region:p.region,coordinateRole:p.coordinateRole,verification:p.verification,geoSource:p.geoSource,geoSourceName:p.geoSourceName,geoChecked:p.geoChecked,geoRecovered:p.geoRecovered||null,guideCoordinateSource:p.guideCoordinateSource||null,geoEvidence:p.geoEvidence||null,geoMethod:p.geoMethod||null,geoEstimated:p.geoEstimated||null,approximation:p.approximation||null,importanceLevel:importanceLevel(p),importanceLabel:importanceLabel(p),importanceEvidence:p.importance?.evidence||[]}}))};}
function setupExport(){
 $('#export-backup').onclick=async()=>{try{const data=await cloud.exportAll();download('francia-preferiti-note-condivisi.json',JSON.stringify(data,null,2));}catch(e){toast(cloud.errorText(e));}};
 $('#export-json').onclick=()=>download('catalogo-francia.json',JSON.stringify({...DATA,places:PLACES},null,2));
 $('#export-geo').onclick=()=>download('luoghi-filtrati.geojson',JSON.stringify(geoJSON(filtered),null,2),'application/geo+json');
 $('#export-csv').onclick=async()=>{let shared;try{shared=await cloud.exportAll();}catch(e){toast(cloud.errorText(e));return;}const notesByPlace=new Map();for(const n of shared.notes){if(!notesByPlace.has(n.place_id))notesByPlace.set(n.place_id,[]);notesByPlace.get(n.place_id).push(n.body);}const head=['Nome','Regione','Zona guida','Sezione guida','Categoria','Latitudine','Longitudine','Tipo coordinata','Stato','Riferimento approssimativo','Metodo stima','Fonte geografica','Preferito','Note','Lingua testo','Guida testo','Titolo nella guida','Pagina EPUB','File EPUB','Testo della guida','Siti web citati'];const cell=v=>{let text=String(v??'');if(typeof v!=='number'&&/^[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};const rows=filtered.map(p=>{const t=p.guideTexts?.[0]||{};return[p.name,p.region,p.guideZone,p.guideSection,META.categories[p.category],p.lat,p.lon,p.coordinateRole,p.verification,p.approximation?.reference||'',p.approximation?.method||'',p.geoSource||(p.guideCoordinateSource?p.geoSourceName+'; '+p.guideCoordinateSource.file+'#'+p.guideCoordinateSource.anchor:''),favorites.has(p.id)?'Si':'No',(notesByPlace.get(p.id)||[]).join('\n\n---\n\n'),t.language||'',META.guides[t.guide]?.title||'',t.title||'',t.page||'',t.file||'',(t.paragraphs||[]).join('\n\n'),(t.paragraphLinks||[]).flat().map(x=>x.url).join(' | ')];});download('catalogo-filtrato.csv','\ufeff'+[head,...rows].map(row=>row.map(cell).join(';')).join('\r\n'),'text/csv;charset=utf-8');};

}

// Visitor contributions (Supabase) and per-browser hidden places.
const community=new AtlasCommunity(cloud);
const HIDDEN_KEY='francia-atlante-hidden-places-v1';
let hiddenPlaces=new Set();
try { const saved=JSON.parse(localStorage.getItem(HIDDEN_KEY)||'[]'); if(Array.isArray(saved))hiddenPlaces=new Set(saved.filter(x=>typeof x==='string')); } catch {}
function storeHidden(){try{localStorage.setItem(HIDDEN_KEY,JSON.stringify([...hiddenPlaces]));}catch{toast('Il browser non permette di conservare i luoghi nascosti.');}}
function hidePlace(id){hiddenPlaces.add(id);storeHidden();closeDetail(false);hideSuggestions();applyFilters();toast('Luogo nascosto da questo browser. Puoi ripristinarlo da “Luoghi nascosti”.');}
function renderHidden(){
 const list=$('#hidden-items');list.replaceChildren();
 const places=[...hiddenPlaces].map(id=>BYID.get(id)).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name,'it'));
 $('#hidden-count').textContent=String(places.length);
 if(!places.length){list.textContent='Nessun luogo nascosto.';return;}
 for(const p of places){const row=document.createElement('div');row.className='hidden-row';
  const label=document.createElement('span');label.textContent=p.name+' · '+p.region;
  const button=document.createElement('button');button.className='btn';button.textContent='Ripristina';button.onclick=()=>{hiddenPlaces.delete(p.id);storeHidden();applyFilters();renderHidden();};
  row.append(label,button);list.append(row);
 }
}
function gmapsURL(input){
 try {
  const u=new URL(String(input||'').trim());const host=u.hostname.toLowerCase();
  const googleDomains=/^(?:www\.)?google\.(?:com|fr|it|co\.uk|de|es|ca|be|ch|nl|com\.au)$/;
  const googleMapDomains=/^maps\.google\.(?:com|fr|it|co\.uk|de|es|ca|be|ch|nl|com\.au)$/;
  const accepted=googleDomains.test(host)&&(/^\/maps(?:\/|$)/.test(u.pathname))||googleMapDomains.test(host)||host==='maps.app.goo.gl'||(host==='goo.gl'&&u.pathname.startsWith('/maps/'));
  return u.protocol==='https:'&&accepted&&u.href.length<=2000?u.href:'';
 } catch{return '';}
}
function mapsCoordinateHint(url){
 const u=gmapsURL(url);if(!u)return null;
 const patterns=[/[!/]3d(-?\d{1,2}(?:\.\d+)?)[!/]4d(-?\d{1,3}(?:\.\d+)?)/i,/!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/i];
 for(const pattern of patterns){const m=u.match(pattern);if(m)return {lat:Number(m[1]),lon:Number(m[2]),camera:false};}
 try{
  const parsed=new URL(u);
  for(const key of ['query','q','ll']){
   const val=parsed.searchParams.get(key)||'';const m=val.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
   if(m)return {lat:Number(m[1]),lon:Number(m[2]),camera:false};
  }
  const m=decodeURIComponent(parsed.pathname).match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
  if(m)return {lat:Number(m[1]),lon:Number(m[2]),camera:true};
 }catch{}
 return null;
}
function franceCoordinates(lat,lon){return Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=40.5&&lat<=52&&lon>=-6&&lon<=10.5;}
// Map-click reports reuse the existing Supabase schema. The generated URL is a
// navigational link to the clicked point, not an externally verified source.
const atlasPinURL=(lat,lon)=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lat.toFixed(6)+','+lon.toFixed(6))}&atlas_pin=1`;
function isAtlasPinURL(value){try{const u=new URL(value);return u.hostname==='www.google.com'&&u.pathname==='/maps/search/'&&u.searchParams.get('atlas_pin')==='1';}catch{return false;}}
let editMode='new',editTarget=null,communityPoll=null,editorBusy=false,locationPicker=null;
function renderLocationPin(){
 const pin=$('#location-pin');if(!pin)return;
 if(!locationPicker?.point){pin.hidden=true;return;}
 const point=atlas.point(locationPicker.point.lon,locationPicker.point.lat);
 pin.hidden=point.x<0||point.x>atlas.width||point.y<0||point.y>atlas.height;
 pin.style.left=point.x+'px';pin.style.top=point.y+'px';
}
function updatePickerState(){
 const picker=locationPicker;if(!picker)return;
 const point=picker.point,valid=Boolean(point&&franceCoordinates(point.lat,point.lon));
 $('#location-pick-confirm').disabled=!valid;
 $('#location-picker-coordinates').textContent=!point?'Nessun punto selezionato.':!valid?'Il punto è fuori dalla Francia metropolitana.':`Punto: ${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`;
 renderLocationPin();
}
function chooseLocationAt(x,y){
 if(!locationPicker)return;
 const latlon=atlas.unproject(atlas.center.x+(x-atlas.width/2)/2**atlas.zoom,atlas.center.y+(y-atlas.height/2)/2**atlas.zoom);
 locationPicker.point={lat:Number(latlon.lat.toFixed(6)),lon:Number(latlon.lon.toFixed(6))};
 updatePickerState();
}
function beginLocationPicker(){
 if(locationPicker||editorBusy)return;
 const current=editMode==='correction'?BYID.get(editTarget):null;
 const lat=Number($('#edit-lat').value),lon=Number($('#edit-lon').value);
 const validEntered=$('#edit-lat').value.trim()&&$('#edit-lon').value.trim()&&franceCoordinates(lat,lon);
 const wasMapView=document.body.classList.contains('map-view');
 const previousDetail=selected;
 locationPicker={point:validEntered?{lat,lon}:null,wasMapView,previousDetail,view:{center:{...atlas.center},zoom:atlas.zoom}};
 $('#place-editor').close();
 closeDetail(false);
 if(innerWidth<=760&&!wasMapView)setMobileView(true);
 document.body.classList.add('location-picking');
 $('#location-picker-panel').hidden=false;
 $('#map').setAttribute('aria-label','Scelta posizione: tocca o clicca sulla mappa per collocare la puntina. Trascina per muoverti; premi Invio per selezionare il centro.');
 if(current&&Number.isFinite(current.lat)&&Number.isFinite(current.lon))atlas.centerOn(current.lon,current.lat,Math.max(13,atlas.zoom));
 else if(validEntered)atlas.centerOn(lon,lat,Math.max(13,atlas.zoom));
 updatePickerState();atlas.draw();
 $('#location-pick-cancel').focus({preventScroll:true});
}
function finishLocationPicker(accept){
 const picker=locationPicker;if(!picker)return;
 if(accept&&!picker.point)return;
 const point=picker.point;
 locationPicker=null;
 document.body.classList.remove('location-picking');
 $('#location-picker-panel').hidden=true;$('#location-pin').hidden=true;
 $('#map').setAttribute('aria-label','Mappa. Trascina per spostarti; usa più e meno per lo zoom. Le frecce spostano la vista.');
 if(!accept){atlas.center={...picker.view.center};atlas.zoom=picker.view.zoom;atlas.draw();atlas.viewChanged();}
 if(innerWidth<=760&&!picker.wasMapView)setMobileView(false);
 if(picker.previousDetail&&BYID.has(picker.previousDetail))openDetail(picker.previousDetail);
 if(accept){
  $('#edit-lat').value=point.lat.toFixed(6);$('#edit-lon').value=point.lon.toFixed(6);
  $('#edit-maps').value='';
  $('#coord-hint').textContent='Punto selezionato sulla mappa. Il collegamento Google Maps sarà generato automaticamente; la posizione non è verificata.';
 }
 $('#place-editor').showModal();
 $('#edit-map-picker').focus({preventScroll:true});
}

function openPlaceEditor(mode,id=null){
 editMode=mode;editTarget=id;
 const form=$('#place-editor-form');form.reset();
 $('#edit-title').textContent=mode==='new'?'Aggiungi un luogo':'Segnala una posizione corretta';
 $('#new-place-fields').hidden=mode!=='new';
 $('#edit-maps').value='';$('#edit-lat').value='';$('#edit-lon').value='';
 $('#coord-hint').textContent='Scegli un punto sulla mappa oppure usa un link Google Maps. Le coordinate possono essere inserite anche a mano.';
 $('#edit-state').textContent='';
 if(mode==='new'){
  $('#edit-region').value=state.region||'';
  $('#edit-category').value=state.category||'patrimonio';
 }else{
  const p=BYID.get(id);if(!p)return;
  $('#edit-current-place').textContent='Località: '+p.name+' · '+p.region;
 }
 $('#edit-current-place').hidden=mode==='new';
 $('#place-editor').showModal();
 $('#edit-map-picker').focus();
}
function refreshCoordinateHint(){
 const link=$('#edit-maps').value.trim(),result=mapsCoordinateHint(link);
 if(result&&franceCoordinates(result.lat,result.lon)){
  $('#edit-lat').value=String(result.lat);$('#edit-lon').value=String(result.lon);
  $('#coord-hint').textContent=result.camera?'Coordinate del centro della mappa: verifica che corrispondano davvero al luogo prima di salvare.':'Coordinate ricavate dal link Google Maps. Verifica il punto prima di salvare.';
 }else if(link){
  $('#coord-hint').textContent=gmapsURL(link)?'Il link non contiene coordinate leggibili: seleziona il punto sulla mappa oppure compila latitudine e longitudine.':'Il link deve essere un URL HTTPS di Google Maps. Puoi anche lasciarlo vuoto e scegliere il punto sulla mappa.';
 }
}
function updateSelectOptions(){
 const region=$('#region'),zone=$('#zone'),savedRegion=region.value,savedZone=zone.value;
 for(const el of [region,zone]){while(el.options.length>1)el.remove(1);}
 for(const r of [...new Set(PLACES.map(p=>p.region))].sort((a,b)=>a.localeCompare(b,'it')))region.add(new Option(r,r));
 for(const z of [...new Set(PLACES.map(p=>p.guideZone))].sort((a,b)=>a.localeCompare(b,'it')))zone.add(new Option(z,z));
 region.value=savedRegion;zone.value=savedZone;
 const list=$('#edit-regions');list.replaceChildren();
 for(const r of [...new Set(PLACES.map(p=>p.region))].sort((a,b)=>a.localeCompare(b,'it'))){const el=document.createElement('option');el.value=r;list.append(el);}
}
function communityPlaceFromRow(row){
 return {id:'user-'+row.id,name:row.name,region:row.region,guideZone:row.region,guideSection:'Luogo aggiunto dagli utenti',category:row.category,
  description:row.description||'',excerpt:row.description||'',rawCategory:'',sources:[],guideLinks:[],guideTexts:[],
  importance:{level:1,label:'In catalogo'},lat:Number(row.lat),lon:Number(row.lon),coordinateRole:'sito',verification:'segnalata',
  geoSource:row.maps_url,geoSourceName:isAtlasPinURL(row.maps_url)?'Puntina collocata sulla mappa dell’atlante':'Google Maps (inserito da un utente)',geoChecked:row.created_at,
  createdBy:row.created_by,communityPlace:true};
}
function mergeCommunityData(){
 const before=selected?BYID.get(selected):null;
 const priorFingerprint=before?JSON.stringify([before.lat,before.lon,before.geoSource,before.description,before.latestCorrection?.id]):'';
 const merged=BASE_PLACES.map(p=>({...p}));
 for(const row of community.places) merged.push(communityPlaceFromRow(row));
 const dictionary=new Map(merged.map(p=>[p.id,p]));
 for(const correction of community.corrections){
  const p=dictionary.get(correction.place_id);if(!p)continue;
  p.lat=Number(correction.lat);p.lon=Number(correction.lon);p.coordinateRole='sito';p.verification='segnalata';
  p.geoSource=correction.maps_url;p.geoSourceName=isAtlasPinURL(correction.maps_url)?'Puntina collocata sulla mappa dell’atlante':'Segnalazione da Google Maps';p.geoChecked=correction.created_at;
  p.latestCorrection=correction;
 }
 PLACES.splice(0,PLACES.length,...merged);BYID.clear();SEARCH.clear();NAME_SEARCH.clear();
 PLACES.forEach(p=>{BYID.set(p.id,p);indexPlace(p);});
 rebuildFavoriteIndex();
 for(const id of [...hiddenPlaces])if(!BYID.has(id))hiddenPlaces.delete(id);
 updateSelectOptions();
 if(selected&&!BYID.has(selected))closeDetail(false);
 applyFilters();
 if(selected){updateDetailFav();const after=BYID.get(selected);const nextFingerprint=after?JSON.stringify([after.lat,after.lon,after.geoSource,after.description,after.latestCorrection?.id]):'';if(priorFingerprint!==nextFingerprint)openDetail(selected);}
 if($('#hidden-dialog').open)renderHidden();
 $('#community-state').textContent='Contributi condivisi aggiornati · '+community.places.length+' luoghi aggiunti, '+community.corrections.length+' segnalazioni'+(community.favoritesAvailable?'':' · Preferiti nuovi luoghi: esegui community-favorites-setup.sql');
}
async function updateCommunity(){try{await community.refresh();}catch(e){$('#community-state').textContent=community.error||String(e.message);}}
async function submitPlaceEditor(event){
 event.preventDefault();if(editorBusy)return;
 const inputLink=$('#edit-maps').value.trim(),lat=Number($('#edit-lat').value.trim()),lon=Number($('#edit-lon').value.trim());
 const status=$('#edit-state');
 if(inputLink&&!gmapsURL(inputLink)){status.textContent='Il link Google Maps non è valido: correggilo o lascialo vuoto per usare la puntina.';return;}
 if(!$('#edit-lat').value.trim()||!$('#edit-lon').value.trim()||!franceCoordinates(lat,lon)){
  status.textContent='Seleziona un punto sulla mappa oppure inserisci coordinate valide della Francia metropolitana.';return;
 }
 const record={maps_url:inputLink?gmapsURL(inputLink):atlasPinURL(lat,lon),lat,lon};
 if(editMode==='new'){
  record.name=$('#edit-name').value.trim();record.region=$('#edit-region').value.trim();record.category=$('#edit-category').value;
  record.description=$('#edit-description').value.trim();
  if(record.name.length<2||record.name.length>120||record.region.length<2||record.region.length>90||record.description.length>2000){status.textContent='Controlla nome, regione e lunghezza della descrizione.';return;}
 }else{if(!BYID.has(editTarget)){status.textContent='Il luogo selezionato non è più presente.';return;}record.place_id=editTarget;}
 editorBusy=true;$('#edit-save').disabled=true;status.textContent='Salvataggio online in corso...';
 try{
  const row=editMode==='new'?await community.addPlace(record):await community.report(record);
  const focusId=editMode==='new'?'user-'+row.id:editTarget;
  $('#place-editor').close();
  for(const k of ['region','category','zone','guide','importance']){state[k]='';$('#'+k).value='';}
  state.favorites=false;$('#favorites-only').checked=false;state.q='';$('#search').value='';$('#clear-search').hidden=true;
  hiddenPlaces.delete(focusId);storeHidden();
  setSidebarCollapsed(false);if(innerWidth<=760)setMobileView(true);
  const p=BYID.get(focusId);if(p){atlas.centerOn(p.lon,p.lat,13);applyFilters();openDetail(focusId);}
  toast(editMode==='new'?'Nuovo luogo aggiunto al database condiviso.':'Nuova posizione salvata nel database condiviso (non verificata).');
 }catch(e){status.textContent=community.error||cloud.errorText(e);}
 finally{editorBusy=false;$('#edit-save').disabled=false;}
}
async function removeMyPlace(p){
 if(!p.communityPlace||p.createdBy!==community.currentUserId)return;
 if(!confirm('Eliminare definitivamente questo luogo dal database condiviso? La modifica sarà visibile a tutti.'))return;
 try {await community.removePlace(p.id.slice(5));closeDetail(false);toast('Il luogo che hai aggiunto è stato eliminato per tutti.');}
 catch(e){toast(cloud.errorText(e));}
}
async function withdrawMyCorrection(p){
 if(p.latestCorrection?.created_by!==community.currentUserId)return;
 if(!confirm('Ritirare questa segnalazione di posizione? Verrà ripristinata la posizione precedente.'))return;
 try{await community.removeReport(p.latestCorrection.id);toast('Segnalazione ritirata.');}
 catch(e){toast(cloud.errorText(e));}
}
function setupCommunityUI(){
 $('#add-place').onclick=()=>openPlaceEditor('new');
 $('#hidden-btn').onclick=()=>{renderHidden();$('#hidden-dialog').showModal();};
 $('#edit-maps').addEventListener('change',refreshCoordinateHint);
 $('#edit-maps').addEventListener('paste',()=>setTimeout(refreshCoordinateHint,0));
 $('#edit-map-picker').onclick=beginLocationPicker;
 $('#location-pick-cancel').onclick=()=>finishLocationPicker(false);
 $('#location-pick-confirm').onclick=()=>finishLocationPicker(true);
 document.addEventListener('keydown',e=>{if(locationPicker&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finishLocationPicker(false);}},true);
 $('#place-editor-form').addEventListener('submit',submitPlaceEditor);
 community.subscribe(()=>{if(community.ready)mergeCommunityData();});
 updateCommunity();
 communityPoll=setInterval(()=>{if(!document.hidden&&navigator.onLine)updateCommunity();},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)updateCommunity();});
 addEventListener('online',updateCommunity);
}
setupSidebar();initControls();setupExport();const atlas=new Atlas();initMapStyles();atlas.fit(PLACES.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)));applyFilters();setupSharedUI();setupCommunityUI();
addEventListener('online',()=>{if(MAP_CONFIG.maptilerKey)atlas.retryTiles();});
// Read-only geometry diagnostics: no session credentials or note contents.
window.ATLAS_DIAGNOSTICS=()=>({version:8,total:PLACES.length,results:filtered.length,markers:$('#markers').children.length,selected,mapMode:atlas.mode,mapConfigured:Boolean(MAP_CONFIG.maptilerKey),importanceFilter:state.importance,importanceSizes:[24,34,44],zoom:atlas.zoom,sort:state.sort,viewportOnly:true,center:atlas.unproject(atlas.center.x,atlas.center.y),bounds:{nw:atlas.unproject(atlas.center.x-atlas.width/2/2**atlas.zoom,atlas.center.y-atlas.height/2/2**atlas.zoom),se:atlas.unproject(atlas.center.x+atlas.width/2/2**atlas.zoom,atlas.center.y+atlas.height/2/2**atlas.zoom)},sidebar:{width:$('#sidebar').getBoundingClientRect().width,collapsed:sidebarCollapsed},first:filtered.slice(0,45).map(p=>({id:p.id,name:p.name,importance:importanceLevel(p)}))});
