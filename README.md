# Atlante di viaggio — Francia

Versione aggiornata con nuovi luoghi, segnalazioni di posizioni tramite puntina sulla mappa oppure Google Maps, preferiti comuni per **tutti** i luoghi e luoghi nascosti per ciascun browser. Il catalogo originale con 5.333 località rimane nel file `index.html`.

## Attivazione su GitHub Pages e Supabase

**Se il sito e' gia' pubblicato e le tabelle sono attive:** apri Supabase > SQL Editor,
esegui **solo `community-unlimited.sql`** e verifica che l'esito sia `OK`.
Il sito gia' pubblicato puo' salvare subito nuovi luoghi e correzioni senza limiti
imposti dagli script dell'Atlante. Pubblicare la versione aggiornata del sito
rimuove inoltre il limite di lettura di 10.000 record per tabella.

**Se installi il progetto da zero:**
1. In Supabase apri il progetto indicato in `cloud-config.js`.
2. Nel **SQL Editor** esegui `community-setup.sql`, poi `community-favorites-setup.sql`
   e infine `community-favorites-fix.sql`. Le versioni attuali non introducono
   limiti giornalieri. Non e' necessario eseguire `community-limits-fix.sql`, ora obsoleto.
3. In **Authentication** attiva **Anonymous Sign-Ins**; le funzioni richiedono
   un'identita' anonima autenticata.
4. Pubblica sul repository GitHub i file di questa cartella, nella directory usata
   da GitHub Pages. Il sito statico non richiede compilazione.
5. Ricarica la pagina con `Ctrl+F5`.

Attenzione: i contributi sono pubblici e non vengono moderati prima della
pubblicazione. L'assenza di limiti applicativi aumenta il rischio di spam e di
crescita incontrollata del database.

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

**Il collegamento Google Maps è facoltativo.** Quando non viene fornito, il sito genera un collegamento Google Maps navigabile a partire dal punto selezionato, per rispettare lo schema del database già installato. Questo collegamento **non costituisce una fonte esterna di verifica**: il luogo resta contrassegnato come posizione proposta da un visitatore, non verificata. La scelta della puntina non richiede nuove tabelle: per correggere i permessi dei preferiti comuni e installare la RPC, esegui anche `community-favorites-fix.sql`.

## Link Google Maps e coordinate

In alternativa alla puntina, sono accettati i collegamenti HTTPS Google Maps. L'app legge automaticamente coordinate presenti nel link, ad esempio i formati `?q=48.8566,2.3522`, `?query=48.8566,2.3522`, `!3d48.8566!4d2.3522`, oppure `@48.8566,2.3522`. Il formato `@...` identifica talvolta **il centro della mappa, non il punto esatto**: verificarlo prima di salvare.

I collegamenti abbreviati `https://maps.app.goo.gl/...` non contengono le coordinate in chiaro. Sono accettati, ma richiedono la compilazione manuale di latitudine e longitudine **oppure la scelta di un punto sulla mappa**. Per interpretarli automaticamente servirebbe un servizio server-side di espansione del collegamento, non presente in questa versione. Le coordinate devono trovarsi nell'intervallo geografico usato da questo atlante della Francia metropolitana.

## Database, sicurezza e limiti

Le tabelle utilizzano Row Level Security: lettura pubblica, scrittura da sessioni anonime autenticate, eliminazione consentita solo all'autore. Le funzioni trigger verificano l'autore e la data, senza introdurre soglie quantitative per nuovi luoghi, correzioni o preferiti dei luoghi aggiunti. Questo non elimina i limiti API, di rete, di dimensione dei dati o di utilizzo previsti da Supabase. I contributi non sono sottoposti a moderazione preventiva: non considerarli verifiche ufficiali. Non condividere informazioni personali nelle descrizioni.

Il sistema originario di **preferiti e note** è conservato per le località presenti nelle guide. I nuovi luoghi utilizzano `atlas_community_favorites` per i **preferiti comuni**. Il salvataggio avviene tramite la funzione `atlas_community_set_favorite` protetta da controllo `auth.uid()`, mentre le versioni precedenti del sito sono compatibili grazie alla SELECT sulle sole righe proprie; i conteggi vengono forniti dalla funzione `atlas_community_favorite_snapshot()` senza esporre gli identificativi dei visitatori. **Le note condivise restano disponibili soltanto per il catalogo originale.** La migrazione non modifica l'archivio v5 esistente.

La pubblicazione su GitHub Pages e l'esecuzione dello script SQL su Supabase devono essere completate dall'amministratore del sito. La sola copia dei file non crea le tabelle nel database remoto.

## Correzione errore "Scrittura non autorizzata" sui nuovi preferiti

1. Il file `community-favorites-setup.sql` deve essere stato eseguito nel progetto Supabase corretto.
2. Apri Supabase > SQL Editor, crea una nuova query e **esegui `community-favorites-fix.sql`**. Questo script e' ripetibile e non cancella dati.
3. Pubblica su GitHub Pages i file aggiornati del sito, in particolare `community.js`, e aggiorna la pagina forzando la cache (`Ctrl+F5`).
4. Segna un luogo creato dagli utenti con la stella e verifica che la voce compaia tra i Preferiti comuni. Rimuovila e verifica che il conteggio diminuisca.

La migrazione concede la lettura completa delle colonne di `atlas_community_favorites` soltanto al ruolo `authenticated`, ma la policy `atlas_community_favorites_select_own` limita sempre le righe visibili a quelle dell'utente corrente. Il nuovo endpoint RPC riceve esclusivamente l'ID del luogo e un booleano: l'ID dell'autore viene ricavato dalla sessione.

Se la scrittura fallisce ancora dopo la migrazione, verificare il **codice e il messaggio originali** della risposta Supabase nella scheda Network degli strumenti sviluppatore. Il solo messaggio 403 del sito non consente di individuare con certezza la causa remota.


## Contributi illimitati nell'Atlante (ottobre 2026)

Esegui `community-unlimited.sql` nello SQL Editor di Supabase dopo aver configurato
le tabelle con gli script precedenti. La migrazione e' ripetibile: rimuove tutte
le soglie di 24 ore per nuovi luoghi, correzioni e nuovi preferiti dei luoghi
creati dagli utenti, senza cancellare i contributi esistenti e senza rimuovere
le regole di autenticazione/RLS. I tre trigger restano attivi come verifiche
dell'autore; nel risultato dello script devono comparire `3`, `3`, `OK`.

Il vecchio `community-limits-fix.sql` non deve essere utilizzato e nella presente
versione e' stato reso inoffensivo. Il nuovo `community.js` elimina inoltre il
limite di lettura di 10.000 record per tabella. Restano le soglie e le quote
di Supabase, compresi eventuali errori HTTP 429 e i limiti delle funzioni
originali `atlas_v5_*` per note/preferiti delle guide. Il caricamento di grandi
quantita' di segnalazioni potrebbe rallentare la mappa.

Se un salvataggio puo' essere stato completato, controlla prima l'elenco dei
luoghi o delle correzioni per evitare duplicati.

## Modificare nome, regione e categoria dei luoghi

Per installare l'aggiornamento su un sito esistente, eseguire **`community-metadata-setup.sql`** in Supabase > SQL Editor > New query. Poi pubblicare tutti i file dello ZIP su GitHub Pages e ricaricare con Ctrl+F5. Non occorre rieseguire gli script di setup precedenti.

Nella scheda di **qualunque** località (sia dalle guide sia aggiunta da un visitatore) compare il comando **Modifica nome e categoria**. Il modulo permette di aggiornare **nome, regione/zona e categoria** selezionandola da tutte le categorie dell'Atlante. Le modifiche appaiono per tutti i visitatori dopo il salvataggio e sono riportate in mappa, nella ricerca, nelle schede e nei filtri. La categoria «Coste, isole e spiagge» può così essere modificata in «Città e borghi».

Le modifiche sono conservate in `public.atlas_place_metadata_edits`: una riga per località, con l'ultima modifica condivisa. I dati originali delle guide rimangono immutati nel catalogo incorporato. L'ID del luogo non cambia: preferiti, note, segnalazioni di posizione e preferenze personali restano collegati allo stesso luogo. Tutti gli utenti anonimi autenticati possono modificare gli stessi campi, senza moderazione preventiva e senza quote giornaliere applicative; prevale l'ultima modifica salvata. Non è presente una cronologia completa delle revisioni, quindi per un ripristino occorre reinserire i valori originari. Eventuali limiti infrastrutturali Supabase restano applicabili.

La nuova versione del sito continua a caricare i luoghi e i preferiti esistenti anche se la migrazione SQL non e' ancora stata eseguita, ma il modulo di modifica metadati rimane disabilitato finche' la tabella non e' disponibile.
