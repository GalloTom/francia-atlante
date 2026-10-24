-- Migrazione superata: da ottobre 2026 non esistono piu' soglie applicative.
-- Il file storico non deve ripristinare accidentalmente limiti gia' rimossi.
-- Per aggiornare un database gia' in produzione eseguire community-unlimited.sql.
-- Questo file e' intenzionalmente un NO-OP.
select 'Questo file e'' obsoleto: eseguire community-unlimited.sql' as avviso;
