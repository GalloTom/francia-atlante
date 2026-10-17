# Atlante di viaggio — Francia

Versione aggiornata con nuovi luoghi, segnalazioni di coordinate tramite Google Maps e luoghi nascosti per ciascun browser. Il catalogo originale con 5.333 località rimane nel file `index.html`.

## Attivazione su GitHub Pages e Supabase

1. In Supabase apri il progetto già indicato in `cloud-config.js`.
2. Apri **SQL Editor** ed esegui interamente `community-setup.sql`. Questo script crea due nuove tabelle e le relative policy; non elimina né modifica i dati preesistenti di preferiti e note (RPC `atlas_v5_*`).
3. Nella sezione **Authentication** di Supabase, verifica che gli accessi anonimi (**Anonymous Sign-Ins**) siano attivi. Per il sito pubblico conviene configurare una protezione CAPTCHA/Turnstile e controllare periodicamente le segnalazioni.
4. Sostituisci sul repository GitHub i vecchi file con **tutti** i file di questa cartella, mantenendoli nella directory di pubblicazione di GitHub Pages. Conserva `index.html`, `app.js`, `cloud.js`, `community.js`, `cloud-config.js`, `map-config.js` e `.nojekyll`. Il sito è statico e non richiede compilazione.
5. Ricarica il sito pubblicato: in sidebar deve comparire il pulsante **Aggiungi luogo** e la riga di stato dei contributi condivisi. Se compare «Esegui community-setup.sql», la migrazione non è ancora disponibile al client o la cache schema di Supabase non è aggiornata.

`cloud-config.js` e `map-config.js` contengono soltanto chiavi pubblicabili/client-side. Non introdurre in questi file chiavi `service_role`, `sb_secret_` o token amministrativi.

## Funzionalità

- **Filtri rimossi**: nessun pulsante «Riscontrate», «Dalla guida» o «Approssimate». Restano ricerca, regione, categoria e filtri avanzati.
- **Aggiungi luogo**: il visitatore inserisce nome, regione, categoria, eventuale descrizione, link Google Maps e coordinate. Il dato viene salvato in `atlas_user_places` e appare a tutti dopo la sincronizzazione (al più circa 60 secondi, salvo aggiornamenti immediati quando si salva).
- **Segnala posizione**: nella scheda del luogo, «Segnala posizione» salva coordinate e link in `atlas_place_corrections`. La segnalazione più recente diventa il punto mostrato sulla mappa, contrassegnato chiaramente come **non verificato**. La provenienza editoriale originale resta nel catalogo incorporato e riappare se tutte le segnalazioni vengono ritirate.
- **Elimina**: l'autore di un luogo aggiunto può eliminarlo dal database condiviso; anche le relative segnalazioni vengono eliminate. Un visitatore non può cancellare i luoghi delle guide né i luoghi creati da altre persone.
- **Nascondi per me**: qualsiasi luogo può essere nascosto nel browser corrente. «Luoghi nascosti» permette di ripristinarlo. La scelta è conservata nel `localStorage` del browser: non rimuove nulla dal database pubblico e non si sincronizza fra dispositivi.
- **Ritira la mia segnalazione**: chi ha inviato l'ultima correzione visibile può rimuoverla usando il medesimo profilo anonimo di Supabase. Una sessione anonima cancellata o sostituita non permette di recuperare automaticamente la proprietà dei contributi precedenti.

## Link Google Maps e coordinate

Sono accettati i collegamenti HTTPS Google Maps. L'app legge automaticamente coordinate presenti nel link, ad esempio i formati `?q=48.8566,2.3522`, `?query=48.8566,2.3522`, `!3d48.8566!4d2.3522`, oppure `@48.8566,2.3522`. Il formato `@...` identifica talvolta **il centro della mappa, non il punto esatto**: verificarlo prima di salvare.

I collegamenti abbreviati `https://maps.app.goo.gl/...` non contengono le coordinate in chiaro. Sono accettati come fonte, ma richiedono la compilazione manuale di latitudine e longitudine. Per interpretarli automaticamente servirebbe un servizio server-side di espansione del collegamento, non presente in questa versione. Le coordinate devono trovarsi nell'intervallo geografico usato da questo atlante della Francia metropolitana.

## Database, sicurezza e limiti

Le nuove tabelle utilizzano Row Level Security: lettura pubblica, scrittura da sessioni anonime autenticabili, eliminazione consentita solo all'autore. Il trigger SQL limita a 5 nuovi luoghi e 25 segnalazioni per identità anonima nelle ultime 24 ore, senza impedire che più profili anonimi vengano creati. I contributi non sono sottoposti a moderazione preventiva: non considerarli verifiche ufficiali. Non condividere informazioni personali nelle descrizioni.

Il sistema originario di **preferiti e note** è conservato per le località presenti nelle guide. Questi strumenti non sono disponibili nei nuovi luoghi creati dagli utenti finché le RPC `atlas_v5_*` non vengono estese per includerli. La nuova migrazione **non** cambia l'archivio v5 esistente.

La pubblicazione su GitHub Pages e l'esecuzione dello script SQL su Supabase devono essere completate dall'amministratore del sito. La sola copia dei file non crea le tabelle nel database remoto.
