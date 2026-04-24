# Windows desktop programa

Electron + React + Vite projektas su lietuvišku dviejų skilčių langu: peržiūra kairėje ir nustatymai dešinėje.

## Paleidimas Windows aplinkoje

1. Įdiekite priklausomybes:

```powershell
npm.cmd install
```

2. Paleiskite kūrimo režimu:

```powershell
npm.cmd run dev
```

Tai paleidžia Vite ir Electron vienu metu.

Jei norite tikrinti bendrą web prisijungimą su serverine vartotojų baze, naudokite:

```powershell
npm.cmd run dev:web
```

Tai paleidžia Vite ir vartotojų autentikacijos serverį vienu metu.

## Build

```powershell
npm.cmd run build
```

Po build galite atidaryti desktop langą iš sugeneruoto renderer build:

```powershell
npm.cmd run start
```

## Pastaba dėl PowerShell

Jei `npm` arba `npx` blokuoja PowerShell vykdymo politika, naudokite `npm.cmd` vietoje `npm`.

## Kas jau paruošta

- Electron pagrindinis procesas Windows langui
- React sąsaja pagal pateiktą dizainą
- Tailwind CSS stilizavimas
- CSV duomenų bazė su LED ekrano modeliais
- Modelio pasirinkimas iš dropdown sąrašo ir parametrų atvaizdavimas
- Mygtukas CSV failui atidaryti ir perskaityti iš naujo po redagavimo
- Vartotojų SQLite bazė su admin/user prisijungimu

## LED modelių duomenys

- Šabloninis failas laikomas `data/led-models.csv`
- Pirmą paleidimą programa nukopijuoja šį failą į vartotojo programos duomenų katalogą
- Vartotojas gali spausti `Atidaryti CSV`, redaguoti failą Excel programoje, išsaugoti ir tada spausti `Atnaujinti`

## Vartotojų duomenų bazė

- Desktop programoje vartotojai laikomi SQLite faile `users.db` vartotojo programos duomenų kataloge
- Web režime privatus hostas turi paleisti `node server/auth-server.js`, o aktyvi vartotojų bazė pagal nutylėjimą bus `data/users.db`
- Admin sukurti vartotojai saugomi SQLite lentelėje `users` su laukais `username`, `password_hash`, `role`
- Prisijungimo duomenys tikrinami serveryje arba Electron pagrindiniame procese, ne vien naršyklės `localStorage`
- Jei randamas senesnis `users.csv`, pirmo paleidimo metu vartotojai automatiškai importuojami į SQLite bazę

## Privatam hostinimui

- Dabartinis Vercel statinis diegimas negali būti ilgalaikė bendros vartotojų failų bazės vieta, nes ten failų sistema nėra pastovi tokiam naudojimui
- Privačiame Node hostinge paleiskite statinį frontend ir atskirai `node server/auth-server.js`
- Render.com variantui paruoštas vieno serviso blueprint failas `render.yaml`
- Tikslus paleidimo planas ir Nginx pavyzdys pateikti `docs/private-hosting.md`
- Svarbūs aplinkos kintamieji:
	- `AUTH_SERVER_HOST` adresas, prie kurio prisiriša auth serveris, numatytai `127.0.0.1`
	- `PORT` Render aplinkoje paduodamas automatiškai ir yra naudojamas pirmumo tvarka
	- `AUTH_SERVER_PORT` serverio portas, numatytai `3001`
	- `USERS_DB_PATH` tikslus SQLite bazės kelias, jei norite laikyti kitur nei `data/users.db`
	- `LEGACY_USERS_CSV_PATH` pasirenkamas senos CSV bazės kelias vienkartinei migracijai
	- `AUTH_TOKEN_SECRET` privalomai pakeiskite produkcijoje, kad admin sesijos būtų saugios
	- `AUTH_CORS_ORIGIN` jei frontend ir API veiks per skirtingus domenus
	- `VITE_AUTH_API_BASE_URL` jei frontend turi kreiptis į atskirą API adresą; nurodykite serviso šaknį be `/api`
