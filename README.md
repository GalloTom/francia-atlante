# Atlante di viaggio — Francia

Versione aggiornata con nuovi luoghi, segnalazioni di posizioni tramite puntina sulla mappa oppure Google Maps, preferiti comuni per **tutti** i luoghi e luoghi nascosti per ciascun browser. Il catalogo originale con 5.333 località rimane nel file `index.html`.

## Attivazione su GitHub Pages e Supabase

1. In Supabase apri il progetto già indicato in `cloud-config.js`.
2. Apri **SQL Editor** ed esegui `community-setup.sql`, seguito da **`community-favorites-setup.sql`**. Se avevi già attivato il sito e `community-setup.sql` era stato eseguito, **esegui solo il nuovo file `community-favorites-setup.sql`**. Entrambi sono additivi e non cancellano i dati preesistenti di preferiti o note (RPC `atlas_v5_*`).
3. Nella sezione **Authentication** di Supabase, verifica che gli accessi anonimi (**Anonymous Sign-Ins**) siano attivi. Per il sito pubblico conviene configurare una protezione CAPTCHA/Turnstile e controllare periodicamente le segnalazioni.
4. Sostituisci sul repository GitHub i vecchi file con **tutti** i file di questa cartella, mantenendoli nella directory di pubblicazione di GitHub Pages. Conserva `index.html`, `app.js`, `cloud.js`, `community.js`, `cloud-config.js`, `map-config.js` e `.nojekyll`. Il sito è statico e non richiede compilazione.
5. Ricarica il sito pubblicato: in sidebar deve comparire il pulsante **Aggiungi luogo** e la riga di stato dei contributi condivisi. Se compare «Esegui community-setup.sql», la migrazione non è ancora disponibile al client o la cache schema di Supabase non è aggiornata.

`cloud-config.js` e `map-config.js` contengono soltanto chiavi pubblicabili/client-side. Non introdurre in questi file chiavi `service_role`, `sb_secret_` o token amministrativi.

## Funzionalità

- **Filtri rimossi**: nessun pulsante «Riscontrate», «Dalla guida» o «Approssimate». Restano ricerca, regione, categoria e filtri avanzati.
- **Aggiungi luogo**: il visitatore inserisce nome, regione, categoria, eventuale descrizione, posizione selezionata sulla mappa oppure link Google Maps e coordinate. Il dato viene salvato in `atlas_user_places` e appare a tutti dopo la sincronizzazione (al più circa 60 secondi, salvo aggiornamenti immediati quando si salva).
- **Segnala posizione**: nella scheda del luogo, «Segnala posizione» permette di scegliere il punto direttamente sulla mappa, oppure di utilizzare un link Google Maps o coordinate manuali. Il punto viene salvato in `atlas_place_corrections`. La segnalazione più recente diventa il punto mostrato sulla mappa, contrassegnato chiaramente come **non verificato**. La provenienza editoriale originale resta nel catalogo incorporato e riappare se tutte le segnalazioni vengono ritirate.
- **Preferiti comuni**: le stelle funzionano anche per i nuovi luoghi aggiunti dagli utenti e compaiono nello stesso filtro dei preferiti del catalogo originale. Ogni visitatore può aggiungere o rimuovere la propria stella.
- **Elimina**: l'autore di un luogo aggiunto può eliminarlo dal database condiviso; anche le relative segnalazioni e **i relativi preferiti** vengono eliminati. Un visitatore non può cancellare i luoghi delle guide né i luoghi creati da altre persone.
- **Nascondi per me**: qualsiasi luogo può essere nascosto nel browser corrente. «Luoghi nascosti» permette di ripristinarlo. La scelta è conservata nel `localStorage` del browser: non rimuove nulla dal database pubblico e non si sincronizza fra dispositivi.
- **Ritira la mia segnalazione**: chi ha inviato l'ultima correzione visibile può rimuoverla usando il medesimo profilo anonimo di Supabase. Una sessione anonima cancellata o sostituita non permette di recuperare automaticamente la proprietà dei contributi precedenti.

## Selezione con puntina sulla mappa

1. Apri la scheda di un luogo e seleziona **Segnala posizione**. In alternativa, premi **Aggiungi luogo** per creare una nuova località.
2. Premi **Scegli sulla mappa**. Il modulo viene temporaneamente chiuso e la mappa MapTiler viene mostrata a piena grandezza; per le correzioni la mappa viene centrata vicino alla posizione attuale del luogo.
3. Trascina la mappa per spostarti, usa i comandi zoom e **tocca o clicca** il punto esatto da salvare. Una puntina evidenzia la selezione. Per cambiare posizione, tocca o clicca un altro punto. Con la tastiera usa Invio sulla mappa per selezionare il centro.
4. Premi **Conferma posizione** per riportare le coordinate nel modulo, poi **Salva nel database condiviso**. **Annulla** ripristina il modulo senza sostituire le coordinate.

**Il collegamento Google Maps è facoltativo.** Quando non viene fornito, il sito genera un collegamento Google Maps navigabile a partire dal punto selezionato, per rispettare lo schema del database già installato. Questo collegamento **non costituisce una fonte esterna di verifica**: il luogo resta contrassegnato come posizione proposta da un visitatore, non verificata. Non è necessaria alcuna nuova migrazione SQL per questa versione: `community-setup.sql` e `community-favorites-setup.sql` rimangono validi.

## Link Google Maps e coordinate

In alternativa alla puntina, sono accettati i collegamenti HTTPS Google Maps. L'app legge automaticamente coordinate presenti nel link, ad esempio i formati `?q=48.8566,2.3522`, `?query=48.8566,2.3522`, `!3d48.8566!4d2.3522`, oppure `@48.8566,2.3522`. Il formato `@...` identifica talvolta **il centro della mappa, non il punto esatto**: verificarlo prima di salvare.

I collegamenti abbreviati `https://maps.app.goo.gl/...` non contengono le coordinate in chiaro. Sono accettati, ma richiedono la compilazione manuale di latitudine e longitudine **oppure la scelta di un punto sulla mappa**. Per interpretarli automaticamente servirebbe un servizio server-side di espansione del collegamento, non presente in questa versione. Le coordinate devono trovarsi nell'intervallo geografico usato da questo atlante della Francia metropolitana.

## Database, sicurezza e limiti

Le nuove tabelle utilizzano Row Level Security: lettura pubblica, scrittura da sessioni anonime autenticabili, eliminazione consentita solo all'autore. Il trigger SQL limita a 5 nuovi luoghi e 25 segnalazioni per identità anonima nelle ultime 24 ore, senza impedire che più profili anonimi vengano creati. I contributi non sono sottoposti a moderazione preventiva: non considerarli verifiche ufficiali. Non condividere informazioni personali nelle descrizioni.

Il sistema originario di **preferiti e note** è conservato per le località presenti nelle guide. I nuovi luoghi utilizzano `atlas_community_favorites` per i **preferiti comuni**; i conteggi vengono forniti dalla funzione `atlas_community_favorite_snapshot()` senza esporre gli identificativi dei visitatori. **Le note condivise restano disponibili soltanto per il catalogo originale.** La migrazione non modifica l'archivio v5 esistente.

La pubblicazione su GitHub Pages e l'esecuzione dello script SQL su Supabase devono essere completate dall'amministratore del sito. La sola copia dei file non crea le tabelle nel database remoto.
