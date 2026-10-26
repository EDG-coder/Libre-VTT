# LIBRE VTT per telefoni e tablet

Le app per Android e per iPhone/iPad sono lo **stesso programma del computer**: dentro l'app gira
Node.js ([nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile)) con `server/launcher.js`, e la
finestra dell'app mostra le stesse pagine. Il collegamento a distanza (`uffa-link`, Rust) è una
libreria dentro l'app.

Le compila GitHub (workflow `.github/workflows/app.yml`, che parte anche con ogni release).

## Come si adatta

- **Dita o mouse**: `mobile.js` sceglie i comandi giusti e cambia al volo (anche a metà partita)
  se si comincia a usare il mouse o lo schermo.
- **Samsung DeX, Chromebook, iPad con mouse e tastiera**: l'app lo dice alla pagina
  (`nativo.js`, `info.dex` / `info.desktop`) e si usa come sul computer.
- **Telefono o tablet**: sotto i 600 punti di larghezza i pannelli vanno a tutto schermo e gli
  strumenti salgono dal basso (`mobile.css`); sui tablet resta la disposizione del computer.

## Compilare a mano

Android (Linux o Mac, con Rust, Android SDK + NDK, Java 17):

    bash pacchetti/mobile/android/prepara.sh
    cd pacchetti/mobile/android && ./gradlew assembleRelease

iPhone/iPad (Mac con Xcode e Rust):

    bash pacchetti/mobile/ios/prepara.sh
    open pacchetti/mobile/ios/LibreVTT.xcodeproj

## I file

- `android/` progetto Android (Java, senza librerie esterne): `MainActivity` (la finestra),
  `Motore` (avvia Node e il collegamento), `Ponte` (i comandi di `nativo.js`), `Dispositivo`
  (DeX, mouse, tastiera, tablet), `Servizio` (tiene viva la partita), `Condivisi` (file condivisi).
- `ios/` progetto Xcode (Swift): `ViewController` (la finestra e il ponte), `Motore`,
  `AvvioNode.c`. Il progetto lo scrive `crea-progetto.py`.
