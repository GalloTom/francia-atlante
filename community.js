/* Shared community places and coordinate reports. Requires community-setup.sql.
   Only a public Supabase publishable key and a short-lived anonymous user JWT are used. */
'use strict';
class AtlasCommunity {
  constructor(cloud) { this.cloud=cloud; this.places=[]; this.corrections=[]; this.ready=false; this.error=''; this.listeners=new Set(); this.inFlight=null; }
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
    for(let offset=0;offset<10000;offset+=500){
      const page=await this.request(table,{query:'?select=*&order=created_at.asc,id.asc&limit=500&offset='+offset});
      if(!Array.isArray(page))throw Error('Risposta inattesa del database.');
      rows.push(...page);if(page.length<500)return rows;
    }
    throw Error('Archivio troppo grande per questa versione del sito.');
  }
  async refresh(){
    if(this.inFlight)return this.inFlight;
    this.inFlight=(async()=>{
      try {
        const [places,corrections]=await Promise.all([this.readAll('atlas_user_places'),this.readAll('atlas_place_corrections')]);
        const changed=!this.ready||Boolean(this.error)||JSON.stringify(this.places)!==JSON.stringify(places)||JSON.stringify(this.corrections)!==JSON.stringify(corrections);
        this.places=places;this.corrections=corrections;this.ready=true;this.error='';if(changed)this.notify();
      }catch(e){this.error=/42P01|PGRST205|Could not find the table|schema cache/i.test(String(e.code)+' '+e.message)?'Esegui community-setup.sql nel progetto Supabase per abilitare le modifiche.':this.cloud.errorText(e);this.notify();throw e;}
      finally{this.inFlight=null;}
    })();return this.inFlight;
  }
  async addPlace(record){const r=await this.request('atlas_user_places',{method:'POST',body:record,prefer:'return=representation'});await this.refresh();return r?.[0];}
  async report(record){const r=await this.request('atlas_place_corrections',{method:'POST',body:record,prefer:'return=representation'});await this.refresh();return r?.[0];}
  async removePlace(uuid){await this.request('atlas_user_places',{method:'DELETE',query:'?id=eq.'+encodeURIComponent(uuid)});await this.refresh();}
  async removeReport(uuid){await this.request('atlas_place_corrections',{method:'DELETE',query:'?id=eq.'+encodeURIComponent(uuid)});await this.refresh();}
  get currentUserId(){return this.cloud.readSession()?.user?.id||null;}
}
