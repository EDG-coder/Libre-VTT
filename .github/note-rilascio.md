LIBRE VTT, the virtual tabletop for role-playing games, compatible with the 5th edition (SRD).

## Which file to download

Download **only the file for your system** from the list below («Assets»). The app picks the right file by itself
for later updates.

### 🪟 Windows 10/11
- **`LIBRE-VTT-Setup-x64.exe`**: almost every PC. Double-click and go.
- **`LIBRE-VTT-Setup-ARM64.exe`**: ARM PCs (Snapdragon).
- `LIBRE-VTT-Setup.exe` works on both but is bigger; `Installa-LIBRE-VTT-Windows.cmd` is an alternative.

### 🍎 Mac (macOS 11 or newer)
- **`LIBRE-VTT-Mac-AppleSilicon.dmg`**: Macs with an Apple chip (M1, M2…).
- **`LIBRE-VTT-Mac-Intel.dmg`**: Intel Macs.
- Not sure which one you have? `LIBRE-VTT.dmg` works on both but is bigger. Open it and drag LIBRE VTT into Applications.

### 🐧 Linux (64 bit)
- **`Installa-LIBRE-VTT-Linux-x64.sh`** for Intel/AMD, **`-arm64.sh`** for ARM, **`-riscv64.sh`** for RISC-V:
  `bash Installa-LIBRE-VTT-Linux-x64.sh`.
- `Installa-LIBRE-VTT-Linux.sh` contains all of them.

### 🤖 Android (7 or newer; also Samsung DeX and Chromebook)
- **`LIBRE-VTT-Android-arm64.apk`**: lighter, works on almost every phone today.
- `LIBRE-VTT-Android.apk`: works on every phone. Open it on the phone and allow the installation.

### 📱 iPhone and iPad (iOS 15 or newer)
- **`LIBRE-VTT-Xcode.zip`**: the ready Xcode project, to open on a Mac (instructions in the LEGGIMI.txt inside).
- Or **`LIBRE-VTT-iOS.ipa`**, to install with Sideloadly or AltStore.

### 🌐 Without installing anything
Players can join from the website https://libre-vtt.pages.dev when the master switches on «🌐 Public game» in the app.

<details>
<summary>The other files (you don't need to download them)</summary>

- `uffa-link-…` and `uffa-link-….sha256`: the remote link, which the app downloads by itself when needed.
- `SHA256SUMS.txt`: the fingerprints of every file; the app uses it to check an update before opening it.
- «Source code (zip / tar.gz)»: the source code.

GitHub does not allow folders in a release, and these files must stay where they are: older versions look for
them by name to update themselves.
</details>

Nothing else needs to be installed on the computer: everything is already inside, including Node.js and the link
to play remotely. No administrator rights are needed and the rest of the computer is not touched. Whoever had the
«MY VTT» version finds it updated with the new name, with the same campaigns and settings.

The phone apps are the same program as the computer one: you can host a game, join someone else's or play alone.
