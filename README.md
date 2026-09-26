# PelaajaRinki V4

Tämä sovellus on valmis GitHub-private-repositorioon, josta se voidaan julkaista internetissä ja käyttää myös muilla koneilla, kun palvelin ja tietokanta ovat hostattu ulkoisesti.

## Mikä on oikea tuotantototeutus?

GitHub on vain koodin tallennuspaikka. Varsinainen data ja käyttökokemus tarvitsevat:
- GitHub private repository (koodi)
- hosting-palvelu (esim. Render, Railway, Azure App Service)
- tietokanta (esim. Supabase Postgres, Neon, Azure Database for PostgreSQL)

Tällä tavoin tiedot säilyvät hallitusti, myös kun adminit ja käyttäjät tekevät muutoksia.

## Tärkeä käytännön periaate

- GitHub = koodi
- Hosting = sovellus
- Tietokanta = data
- Reaaliaikainen päivitys = server-sent events (SSE) tai polling

Esimerkiksi:
- GitHub private repo
- Render-hostattu Node.js API
- Supabase PostgreSQL tietokanta
- SSE / polling ilmoittaa varaukset heti kaikille kirjautuneille käyttäjille

## Ominaisuudet
- SQLite paikalliseen kehitykseen
- Adminin branding-luonti (logo & mainokset)
- Käyttäjätilit, profiilit ja vuorojen hallinta
- Pelaajat eritelty verkostoitumisesta
- Mobiilioptimoitu käyttöliittymä
- Valmis skaalautuvaan hosting-ratkaisuun

## Testitunnukset
- Admin: admin / admin
- Host: Host / host123

## Paikallinen kehitys
1. Asenna riippuvuudet:
   npm install
2. Käynnistä sovellus:
   npm start
3. Avaa selaimessa:
   http://localhost:3000

## GitHub private repository -valmistelu

1. Luo uusi private repository GitHubissa.
2. Kloonaa projektisi paikallinen kansio ja pushaa siihen.
3. Lisää .gitignore ja ympäristömuuttujat ennen pushia.
4. Älä koskaan tallenna salasanoja repoihin. Käytä .env-tiedostoa vain paikallisesti.

Esimerkki komennoista:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/USERNAME/PELAAJARINKI.git
git push -u origin main
```

## Tuotantoon - suositus arkkitehtuuri

### Suositus 1: Render + Supabase
- GitHub private repo
- Render-hostattu Node.js-palvelin
- Supabase PostgreSQL
- Reaaliaikainen päivitys SSE:llä

### Suositus 2: Azure App Service + Azure Database for PostgreSQL
- GitHub private repo
- Azure App Service
- Azure Database for PostgreSQL Flexible Server
- Azure Monitor / Application Insights

## Ympäristömuuttujat

Luo paikallisesti tiedosto `.env` (älä laita sitä GitHubiin):

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://user:password@host:5432/pelaajaringi
SESSION_SECRET=muuta-tama-ainutlaatuinen-arvo
```

## Kanta ja reaaliaikaisuus

Nykyinen paikallinen versio käyttää SQLite:ta. Tuotantonäkökulmasta paras ratkaisu on:
- siirtää data Postgres-tietokantaan
- käyttää SSE:tä / pollingia, jotta varaukset päivittyvät kaikille käyttäjille reaaliajassa
- pitää admin ja käyttäjät samassa tietokannassa, jolloin muutokset näkyvät kaikille heti

## Admin-toiminnot tuotannossa
- Tuotannossa adminin pitää pystyä lisäämään logoja ja mainoksia ilman, että käyttöliittymä menee lukituksi.
- Kuvat kannattaa tallentaa joko:
  - suoraan blob-storageen (Azure Blob / Cloudinary / Supabase Storage), tai
  - palvelimen uploads-kansioon, jos hosting tarjoaa pysyvän disk-tilan

## Ongelman ratkaisun ydinsääntö

Jos haluat, että kaikki käyttäjät sekä adminit näkevät ja muuttavat samaa dataa internetistä:
- palvelin pitää olla aina päällä
- data pitää olla hostatun tietokannan alla
- frontendin pitää ladata uudet tiedot uudelleen tai saada SSE-viesti

## Tiedostot
- `server.js` – Express-palvelin ja API
- `app.js` – frontend-käyttöliittymä
- `style.css` – käyttöliittymän tyylit
- `uploads/` – logot ja mainokset
- `pelaajaringi.db` – SQLite paikalliselle kehitykselle

## Huomio
Tämä projekti on valmis siirrettäväksi private GitHub -repoon ja hostattavaksi internetissä. Seuraava vaihe on valita palveluntarjoaja ja tietokanta, minkä jälkeen data voidaan siirtää pysyvästi hosting-ympäristöön.