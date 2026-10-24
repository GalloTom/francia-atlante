/* Shared places, corrections and community favorites. Requires community-setup.sql and community-favorites-setup.sql.
   Only a public Supabase publishable key and a short-lived anonymous user JWT are used. */
'use strict';
class AtlasCommunity {
  constructor(cloud) { this.cloud=cloud; this.places=[]; this.corrections=[]; this.favoriteSummary=new Map(); this.favoritesAvailable=false; this.ready=false; this.error=''; this.listeners=new Set(); this.inFlight=null; }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  notify() { for (const fn of this.listeners) fn(this); }
  async request(table, {method='GET', query='', body=null, prefer=''}={}) {
    if (!this.cloud.configured) throw Error(this.cloud.configError);
    if (!navigator.onLine) throw Error('Connessione assente: modifica non salvata.');
    const editing=method!=='GET';
    const session=await this.cloud.session(editing);
    const headers={'apikey':this.cloud.key,'Accept':'application/json'};
    if (session?.access_token) headers.Authorization='Bearer '+session.access_token;
    else if(this.cloud.key.startsWith('eyJ')) headers.Authorization='Bearer '+this.cloud.key;
    if(body!==null) headers['Content-Type']='application/json';
    if(prefer) headers['Prefer']=prefer;
    const ctrl=new AbortController(), timeout=setTimeout(()=>ctrl.abort(),20000);
    try {
      const response=await fetch(this.cloud.url+'/rest/v1/'+table+query,{
        method,headers,body:body===null?undefined:JSON.stringify(body),signal:ctrl.signal,cache:'no-store',credentials:'omit'
      });
      const raw=await response.text();let result=null;
      try {result=raw?JSON.parse(raw):null;}catch{throw Error('Risposta del database non valida.');}
      if(!response.ok){const e=Error(result?.message||result?.error||'Errore Supabase '+response.status);e.status=response.status;e.code=result?.code;throw e;}
      return result;
    } catch(e) {
      if(e.name==='AbortError'||e instanceof TypeError) throw Error('Connessione interrotta: verifica i dati prima di ritentare.');
      throw e;
    } finally { clearTimeout(timeout); }
  }
  async readAll(table) {
    const rows=[];
    let offset=0;
    while(true){
      const page=await this.request(table,{query:'?select=*&order=created_at.asc,id.asc&limit=500&offset='+offset});
      if(!Array.isArray(page))throw Error('Risposta inattesa del database.');
      rows.push(...page);
      if(page.length<500)return rows;
      offset+=page.length;
    }
  }
  async refresh(){
    if(this.inFlight)return this.inFlight;
    this.inFlight=(async()=>{
      try {
        const [places,corrections,latestFavorites]=await Promise.all([
          this.readAll('atlas_user_places'),this.readAll('atlas_place_corrections'),
          this.request('rpc/atlas_community_favorite_snapshot').then(rows=>({rows,available:true})).catch(e=>{
            // Publishing the site before the SQL migration must not hide existing community places.
            if(/PGRST202|atlas_community_favorite_snapshot/i.test(String(e.code)+' '+e.message))
              return {rows:[],available:false};
            throw e;
          })
        ]);
        const favoriteRows=latestFavorites.rows;
        if(!Array.isArray(favoriteRows))throw Error('Riepilogo dei preferiti comuni non valido.');
        const summary=new Map(favoriteRows.map(row=>[row.place_id,{
          favorite_count:Number(row.favorite_count)||0,mine:row.mine===true
        }]));
        const changed=!this.ready||Boolean(this.error)||this.favoritesAvailable!==latestFavorites.available||
          JSON.stringify(this.places)!==JSON.stringify(places)||
          JSON.stringify(this.corrections)!==JSON.stringify(corrections)||
          JSON.stringify([...this.favoriteSummary])!==JSON.stringify([...summary]);
        this.places=places;this.corrections=corrections;this.favoriteSummary=summary;
        this.favoritesAvailable=latestFavorites.available;
        this.ready=true;this.error='';if(changed)this.notify();
      }catch(e){
        const detail=String(e.code)+' '+e.message;
        this.error=/PGRST202|atlas_community_favorite_snapshot/i.test(detail)?'Esegui community-favorites-setup.sql su Supabase per abilitare i preferiti dei nuovi luoghi.':
          /42P01|PGRST205|Could not find the table|schema cache/i.test(detail)?'Esegui community-setup.sql nel progetto Supabase per abilitare le modifiche.':this.cloud.errorText(e);
        this.notify();throw e;
      }
      finally{this.inFlight=null;}
    })();return this.inFlight;
  }
  async addPlace(record){const r=await this.request('atlas_user_places',{method:'POST',body:record,prefer:'return=representation'});await this.refresh();return r?.[0];}
  async report(record){const r=await this.request('atlas_place_corrections',{method:'POST',body:record,prefer:'return=representation'});await this.refresh();return r?.[0];}
  async favorite(uuid,value){
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid))throw Error('Identificativo del luogo non valido.');
    if(!this.favoritesAvailable)throw Error('Esegui community-favorites-setup.sql su Supabase per attivare i preferiti dei nuovi luoghi.');
    let row;
    try {
      row=await this.request('rpc/atlas_community_set_favorite',{
        method:'POST',body:{p_place_id:uuid,p_value:Boolean(value)}
      });
    } catch(e) {
      if(e.code==='PGRST202'||/atlas_community_set_favorite/i.test(String(e.message)))
        throw Error('Esegui community-favorites-fix.sql nello SQL Editor di Supabase per abilitare il salvataggio dei preferiti.');
      throw e;
    }
    if(!row||row.place_id!=='user-'+uuid||!Number.isFinite(Number(row.favorite_count))||typeof row.mine!=='boolean')
      throw Error('Risposta non valida dal database: aggiorna la pagina per verificare il preferito.');
    this.favoriteSummary.set(row.place_id,{favorite_count:Number(row.favorite_count),mine:row.mine});
    this.notify();
    return row;
  }
  async removePlace(uuid){await this.request('atlas_user_places',{method:'DELETE',query:'?id=eq.'+encodeURIComponent(uuid)});await this.refresh();}
  async removeReport(uuid){await this.request('atlas_place_corrections',{method:'DELETE',query:'?id=eq.'+encodeURIComponent(uuid)});await this.refresh();}
  get currentUserId(){return this.cloud.readSession()?.user?.id||null;}
}
