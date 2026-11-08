# LIBRE VTT for phones and tablets

The Android and iPhone/iPad apps are the **same program as the computer one**: inside the app runs Node.js
([nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile)) with `server/launcher.js`, and the app window
shows the same pages. The remote link (`uffa-link`, Rust) is a library inside the app.

GitHub builds them (workflow `.github/workflows/app.yml`, which also runs with every release).

## How it adapts

- **Fingers or mouse**: `mobile.js` picks the right controls and switches on the fly (even mid-game) if you start
  using the mouse or the screen.
- **Samsung DeX, Chromebook, iPad with mouse and keyboard**: the app tells the page (`nativo.js`, `info.dex` /
  `info.desktop`) and it works like on a computer.
- **Phone or tablet**: below 600 points of width the panels go full screen and the tools slide up from the bottom
  (`mobile.css`); on tablets the computer layout stays.

## Building by hand

Android (Linux or Mac, with Rust, Android SDK + NDK, Java 17):

    bash pacchetti/mobile/android/prepara.sh
    cd pacchetti/mobile/android && ./gradlew assembleRelease

iPhone/iPad (Mac with Xcode and Rust):

    bash pacchetti/mobile/ios/prepara.sh
    open pacchetti/mobile/ios/LibreVTT.xcodeproj

## The files

- `android/` Android project (Java, no external libraries): `MainActivity` (the window), `Motore` (starts Node
  and the link), `Ponte` (the commands of `nativo.js`), `Dispositivo` (DeX, mouse, keyboard, tablet), `Servizio`
  (keeps the game alive), `Condivisi` (shared files).
- `ios/` Xcode project (Swift): `ViewController` (the window and the bridge), `Motore`, `AvvioNode.c`. The project
  is written by `crea-progetto.py`.
- `LEGGIMI-Xcode.txt`: the instructions that go into `LIBRE-VTT-Xcode.zip`.
- The plugins built into the apps are in `plugins-inclusi/` (at the root of the repository).
