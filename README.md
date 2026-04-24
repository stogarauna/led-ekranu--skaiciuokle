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

## LED modelių duomenys

- Šabloninis failas laikomas `data/led-models.csv`
- Pirmą paleidimą programa nukopijuoja šį failą į vartotojo programos duomenų katalogą
- Vartotojas gali spausti `Atidaryti CSV`, redaguoti failą Excel programoje, išsaugoti ir tada spausti `Atnaujinti`
