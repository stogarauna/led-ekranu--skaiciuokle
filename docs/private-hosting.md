# Privatus Hostingas

Šis projektas jau paruoštas veikti privačiame Node hostinge su atskiru autentikacijos serveriu ir SQLite vartotojų baze.

## Render.com

Paprasčiausias variantas dabar yra vienas Render Web Service, kuris aptarnauja ir `dist` frontend, ir `/api` autentikacijos maršrutus iš to paties `node server/auth-server.js` proceso.

- Blueprint failas: `render.yaml`
- Render servisui reikia persistent disk, nes `users.db` negali būti laikoma laikinoje failų sistemoje
- Dėl persistent disk Render servisas negalės būti `free` plane ir nebus skalinamas į kelias instancijas
- Render privalo naudoti `PORT`, o serveris jau pritaikytas automatiškai bindintis prie `0.0.0.0`

### Render diegimo seka

1. Susiekite GitHub repo su Render.
2. Pasirinkite `Blueprint` arba importuokite repo, kuriame yra `render.yaml`.
3. Patvirtinkite Web Service sukūrimą.
4. Patikrinkite, kad Render pridėjo persistent disk į `/opt/render/project/src/data`.
5. Po deploy atsidarykite `/api/health` ir pagrindinį puslapį.

### Render pastabos

- Jei viską laikote viename Render servise, `VITE_AUTH_API_BASE_URL` nereikia, nes frontend kreipsis į tą patį domeną per `/api`
- Jei norėsite vėliau skirti frontend ir auth į atskirus servisus, tada `VITE_AUTH_API_BASE_URL` reikės nustatyti į auth serviso adresą
- `AUTH_TOKEN_SECRET` Render sugeneruos automatiškai per `render.yaml`

## Rekomenduojama schema

- Frontend: statiniai failai iš `dist/`
- Auth API: `node server/auth-server.js`
- Vartotojų bazė: `data/users.db`
- Reverse proxy: `Nginx`, `Caddy` arba `Apache`

## 1. Pradinė paruošimo seka

```powershell
npm.cmd install
npm.cmd run build
```

Nukopijuokite `.env.auth.example` į `.env.auth` ir užpildykite tikras reikšmes.

Jei frontend ir API bus skirtinguose domenuose, nukopijuokite `.env.web.example` į `.env.production.local` ir nustatykite `VITE_AUTH_API_BASE_URL`.

## 2. Auth serverio paleidimas

Windows testavimui:

```powershell
$env:AUTH_SERVER_HOST="127.0.0.1"
$env:AUTH_SERVER_PORT="3001"
$env:USERS_DB_PATH="C:\deploy\led-app\data\users.db"
$env:AUTH_TOKEN_SECRET="replace-with-a-long-random-secret"
$env:AUTH_CORS_ORIGIN="https://your-domain.example"
node server/auth-server.js
```

Linux testavimui:

```bash
export AUTH_SERVER_HOST=127.0.0.1
export AUTH_SERVER_PORT=3001
export USERS_DB_PATH=/srv/led-app/data/users.db
export AUTH_TOKEN_SECRET=replace-with-a-long-random-secret
export AUTH_CORS_ORIGIN=https://your-domain.example
node server/auth-server.js
```

Pastaba: jei serveryje jau turite seną `users.csv`, galite nurodyti `LEGACY_USERS_CSV_PATH`, ir sistema pirmo paleidimo metu importuos vartotojus į SQLite.

## 3. Frontend publikavimas

Paprasčiausias variantas: `dist/` katalogą aptarnauja reverse proxy arba atskiras statinių failų serveris.

Render atveju papildomo reverse proxy nereikia, nes `server/auth-server.js` jau pats aptarnauja ir statinius failus, ir `/api`.

Jei frontend ir API yra tame pačiame domene, `VITE_AUTH_API_BASE_URL` palikite tuščią ir proxinkite `/api` į auth serverį.

Jei frontend ir API yra skirtinguose domenuose:

- frontend `.env.production.local`:

```env
VITE_AUTH_API_BASE_URL=https://auth.your-domain.example
```

Jei netyčia nurodysite adresą su `/api` gale, klientas dabar tai toleruos, bet rekomenduojama naudoti tik serviso šaknį.

- auth serverio `AUTH_CORS_ORIGIN` turi rodyti į frontend domeną, pvz. `https://app.your-domain.example`

## 4. Nginx pavyzdys

Vienam domenui su tuo pačiu `/api` keliu:

```nginx
server {
    listen 80;
    server_name your-domain.example;

    root /srv/led-app/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 5. Minimalus tikrinimas po paleidimo

Auth sveikatos patikra:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:3001/api/health
```

Login testas:

```powershell
$body = @{ username = "admin"; password = "admin" } | ConvertTo-Json
Invoke-RestMethod -Uri http://127.0.0.1:3001/api/auth/login -Method Post -Body $body -ContentType "application/json"
```

## 6. Produkcijos pastabos

- Būtinai pakeiskite `AUTH_TOKEN_SECRET`
- `users.db` laikykite pastoviame diske, ne laikinoje deploy aplinkoje
- Dabartinis Vercel statinis variantas tinka frontend demonstracijai, bet ne bendrai vartotojų bazei
- Jei norėsite, kitas žingsnis gali būti slaptažodžių atnaujinimo, audito logų arba atsarginių kopijų funkcijos