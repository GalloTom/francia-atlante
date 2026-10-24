/* Francia Atlante v5. Browser client for the Supabase Auth and PostgREST APIs.
   No secret/admin key is accepted. Only the anonymous session is kept locally. */
'use strict';
class AtlasCloud {
  constructor(config = {}) {
    this.config = config;
    this.url = String(config.supabaseUrl || '').replace(/\/+$/, '');
    this.key = String(config.publishableKey || '').trim();
    this.state = 'unconfigured'; this.message = 'Archivio da collegare';
    this.summary = new Map(); this.listeners = new Set(); this.memorySession = null;
    this.authPromise = null; this.refreshPromise = null; this.storageOK = true;
    this.lastSync = null; this.identityLost = false;
    this.configError = this.validate();
    this.configured = !this.configError;
    this.storageKey = 'francia-atlante-v5-session:' + this.url;
    try { localStorage.setItem(this.storageKey + ':test', '1'); localStorage.removeItem(this.storageKey + ':test'); }
    catch { this.storageOK = false; }
    if (this.configured) {
      this.state = 'connecting'; this.message = 'Collegamento all\u2019archivio...';
      this.timer = setInterval(() => { if (!document.hidden) this.refresh().catch(() => {}); }, Math.max(15, Number(config.pollSeconds) || 30) * 1000);
      addEventListener('online', () => this.refresh().catch(() => {}));
      addEventListener('offline', () => this.setState('offline', 'Connessione assente: dati non aggiornati'));
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh().catch(() => {}); });
      addEventListener('storage', e => { if (e.key === this.storageKey) { this.memorySession = null; this.refresh().catch(() => {}); } });
    }
  }
  validate() {
    if (!this.url || !this.key) return 'Compila cloud-config.js per attivare l\u2019archivio condiviso.';
    try { const u = new URL(this.url); if (u.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(u.hostname) || u.pathname !== '/' || u.search || u.hash || u.username) throw Error(); }
    catch { return 'URL Supabase non valido. Usa l\u2019URL HTTPS del progetto.'; }
    if (this.key.startsWith('sb_secret_')) return 'Chiave segreta rifiutata. Usa soltanto la Publishable key.';
    if (this.key.startsWith('sb_publishable_') && this.key.length > 20) return '';
    if (this.key.startsWith('eyJ')) {
      try { const c = JSON.parse(atob(this.key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (c.role === 'anon') return ''; } catch {}
    }
    return 'Chiave non valida o privilegiata: usa una Publishable key o la vecchia chiave anon.';
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }
  setState(s, msg) { this.state = s; this.message = msg; this.emit(); }
  readSession() {
    if (this.storageOK) { try { return JSON.parse(localStorage.getItem(this.storageKey) || 'null'); } catch { this.storageOK = false; } }
    return this.memorySession;
  }
  storeSession(s) {
    if (s && (!s.access_token || !s.refresh_token || !s.user?.id)) throw Error('Risposta di autenticazione incompleta.');
    const v = s ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now()/1000) + s.expires_in, user: {id:s.user.id} } : null;
    this.memorySession = v;
    if (this.storageOK) { try { if (v) localStorage.setItem(this.storageKey, JSON.stringify(v)); else localStorage.removeItem(this.storageKey); } catch { this.storageOK = false; } }
    return v;
  }
  async request(path, body, token) {
    if (!this.configured) throw Error(this.configError);
    if (!navigator.onLine) throw Error('Connessione assente. Nessuna modifica salvata sul sito.');
    const headers = { apikey: this.key, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    else if (this.key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + this.key;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const r = await fetch(this.url + path, { method:'POST', headers, body:JSON.stringify(body || {}), signal:controller.signal, cache:'no-store', credentials:'omit' });
      const text = await r.text(); let data; try { data = text ? JSON.parse(text) : null; } catch { throw Error('Risposta del server non leggibile.'); }
      if (!r.ok) { const e = Error(data?.message || data?.msg || data?.error_description || data?.error || 'Errore del servizio'); e.status = r.status; e.code = data?.code || data?.error_code; throw e; }
      return data;
    } catch (e) {
      if (e.name === 'AbortError' || e instanceof TypeError) throw Error('Esito non confermato: connessione interrotta. Aggiorna prima di riprovare.');
      throw e;
    } finally { clearTimeout(timer); }
  }
  async session(create = false, force = false) {
    if (!this.configured) throw Error(this.configError);
    if (this.authPromise) { await this.authPromise; return this.session(create, force); }
    const operation = async () => {
      let s = this.readSession();
      if (s && (force || s.expires_at < Date.now()/1000 + 90)) {
        try { s = this.storeSession(await this.request('/auth/v1/token?grant_type=refresh_token', { refresh_token:s.refresh_token })); }
        catch (e) {
          if ([400,401,403].includes(e.status) && e.status !== 429) { this.storeSession(null); this.identityLost = true; s = null; }
          else throw e;
        }
      }
      if (!s && create) {
        const captcha = await this.captchaToken();
        const payload = {data:{application:'francia-atlante-v5'}};
        if (captcha) payload.gotrue_meta_security = {captcha_token:captcha};
        s = this.storeSession(await this.request('/auth/v1/signup', payload));
      }
      return s;
    };
    this.authPromise = navigator.locks ? navigator.locks.request(this.storageKey, operation) : operation();
    try { return await this.authPromise; } finally { this.authPromise = null; }
  }
  async rpc(name, args = {}, write = false) {
    let s = await this.session(write);
    try { return await this.request('/rest/v1/rpc/' + name, args, s?.access_token); }
    catch (e) {
      if (e.status === 401 && s) { s = await this.session(write, true); return this.request('/rest/v1/rpc/' + name, args, s?.access_token); }
      throw e;
    }
  }
  async refresh() {
    if (!this.configured) { this.emit(); return; }
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      try {
        const r = await this.rpc('atlas_v5_snapshot');
        if (r?.version !== 5 || !Array.isArray(r.places)) throw Error('Archivio incompatibile: esegui supabase-setup.sql.');
        this.summary = new Map(r.places.map(p => [p.place_id, p]));
        this.lastSync = new Date(); this.setState('ready', 'Archivio condiviso aggiornato');
      } catch (e) { this.setState('error', this.errorText(e)); throw e; }
      finally { this.refreshPromise = null; }
    })();
    return this.refreshPromise;
  }
  async place(id, offset = 0) { return this.rpc('atlas_v5_place', {p_place_id:id, p_offset:offset}); }
  async favorite(id, value) {
    const r = await this.rpc('atlas_v5_favorite', {p_place_id:id, p_value:value}, true);
    const old = this.summary.get(id) || {place_id:id, note_count:0};
    this.summary.set(id, {...old, favorite_count:r.favorite_count, mine:r.mine});
    this.lastSync = new Date(); this.setState('ready', 'Preferito salvato sul sito');
    return r;
  }
  async note(id, body, version) {
    const r = await this.rpc('atlas_v5_note', {p_place_id:id, p_body:body, p_expected_version:version}, true);
    const old = this.summary.get(id) || {place_id:id, favorite_count:0, mine:false};
    this.summary.set(id, {...old, note_count:r.note_count});
    this.lastSync = new Date(); this.setState('ready', body.trim() ? 'Nota salvata sul sito' : 'La tua nota \u00e8 stata rimossa');
    return r;
  }
  async exportAll() { return this.rpc('atlas_v5_export'); }
  errorText(e) {
    const m = String(e.message || e);
    if (e.status === 409) return 'La nota \u00e8 cambiata in un\u2019altra scheda. Ricarica la versione sul sito prima di salvare.';
    const sqlLimit = m.match(/RATE_LIMIT:\s*([^\r\n]+)/i);
    if (sqlLimit) return 'Limite raggiunto: ' + sqlLimit[1].replace(/[.\s]+$/, '') + '. Controlla i dati salvati e riprova quando rientri nel limite delle 24 ore.';
    if (e.status === 429) return 'Supabase ha limitato temporaneamente le richieste (HTTP 429). Controlla sul sito se la modifica risulta salvata prima di riprovare.';
    if (/anonymous.*disabled/i.test(m)) return 'Attiva Anonymous Sign-Ins nelle impostazioni Authentication di Supabase.';
    if (/captcha/i.test(m)) return 'Verifica antispam non riuscita. Controlla Turnstile e le impostazioni CAPTCHA.';
    if (/PGRST202|schema cache|atlas_v5_/.test(m)) return 'Archivio non inizializzato: esegui supabase-setup.sql nel progetto Supabase.';
    if (e.status === 401) return 'Chiave o sessione non valida. Verifica la Publishable key del progetto.';
    if (e.status === 403) return 'Scrittura non autorizzata. Controlla le funzioni SQL e lo stato dell\u2019utente anonimo.';
    return m;
  }
  async captchaToken() {
    const key = String(this.config.turnstileSiteKey || '').trim(); if (!key) return '';
    if (!window.turnstile) {
      await new Promise((resolve,reject) => {
        const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async=true;s.onload=resolve;s.onerror=()=>reject(Error('Impossibile caricare la verifica antispam.'));document.head.append(s);
      });
    }
    return new Promise((resolve,reject) => {
      const dialog=document.createElement('dialog');dialog.className='dialog cloud-captcha';
      dialog.innerHTML='<h2>Verifica antispam</h2><p>Non occorrono account o password.</p><div class="turnstile-box"></div><button class="btn captcha-cancel">Annulla</button>';
      document.body.append(dialog);dialog.showModal();let widget,done=false;
      const finish=(error,token)=>{if(done)return;done=true;clearTimeout(timer);try{if(widget!==undefined)window.turnstile.remove(widget);}catch{}dialog.close();dialog.remove();error?reject(error):resolve(token);};
      const timer=setTimeout(()=>finish(Error('Verifica antispam scaduta. Riprova.')),120000);
      dialog.querySelector('button').onclick=()=>finish(Error('Pubblicazione annullata.'));
      dialog.addEventListener('cancel',e=>{e.preventDefault();finish(Error('Pubblicazione annullata.'));});
      try { widget=window.turnstile.render(dialog.querySelector('.turnstile-box'),{sitekey:key,theme:'light',callback:t=>finish(null,t),'error-callback':()=>finish(Error('Verifica antispam non riuscita.')),'expired-callback':()=>finish(Error('Verifica antispam scaduta.'))}); }
      catch { finish(Error('Configurazione antispam non valida.')); }
    });
  }
}
window.AtlasCloud = AtlasCloud;
