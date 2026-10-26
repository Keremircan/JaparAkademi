-- Türkçe tam metin araması (FG-2.4): aksan/Türkçe karakter farkını yok saymak için unaccent.
-- unaccent "trusted" bir eklentidir; veritabanı sahibi (akademi_owner) kurabilir.
CREATE EXTENSION IF NOT EXISTS unaccent;
