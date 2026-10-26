#!/usr/bin/env python3
"""Crea gli installatori di LIBRE VTT, ognuno in un solo file.

    python3 pacchetti/installer/crea-installer.py [cartella-uscita]

Produce:
    Installa-LIBRE-VTT-Linux.sh    script con il programma dentro (si estrae da solo)
    Installa LIBRE VTT.cmd         per Windows: doppio clic, finestra grafica (PowerShell + WinForms,
                                che ci sono in ogni Windows 10/11)

Così come sono, scaricano Node.js da nodejs.org durante l'installazione (e lo controllano).
Per installatori che non scaricano niente si possono mettere dentro Node e il collegamento
a distanza già compilato (è quello che fa GitHub Actions, vedi .github/workflows/rilascio.yml):

    --node-linux-x64 <cartella o .tar.gz>   --node-linux-arm64 <...>   --node-win-x64 <cartella o .zip>
    --link-linux-x64 <file>   --link-linux-arm64 <file>   --link-win-x64 <file.exe>
    --repo utente/progetto    (scritto in rilascio.json: l'app saprà dove scaricare il collegamento)
    --stage-windows <cartella>   prepara anche i file per setup.exe (pacchetti/installer/windows/myvtt.iss)
"""
import base64
import fnmatch
import io
import json
import os
import shutil
import sys
import tarfile
import tempfile
import zipfile

QUI = os.path.dirname(os.path.abspath(__file__))
PROGETTO = os.path.dirname(os.path.dirname(QUI))      # pacchetti/installer → la cartella del progetto

# Quello che va installato: i file del programma (con le stesse cartelle del progetto), non le
# campagne o i dati di chi lo costruisce.
CARTELLE = ['server', 'condiviso', 'web', 'sistemi']             # tutto quello che c'è dentro
FILE = ['package.json', 'assets/Sfondi/main.webp', 'assets/Sfondi/main-en.webp',
        'pacchetti/uffa-link/Cargo.toml', 'pacchetti/uffa-link/Cargo.lock']
LINK_SRC = 'pacchetti/uffa-link/src'                              # i sorgenti del collegamento (si compila sul posto se serve)


def file_programma():
    """(percorso sul disco, percorso dentro app/) per ogni file del programma"""
    out = []
    for rel in FILE:
        p = os.path.join(PROGETTO, rel)
        if os.path.isfile(p):
            out.append((p, rel))
    for cartella in CARTELLE + [LINK_SRC]:
        for radice, dirs, nomi in os.walk(os.path.join(PROGETTO, cartella)):
            dirs[:] = sorted(d for d in dirs if not d.startswith('.'))
            for nome in sorted(nomi):
                if nome.startswith('.'):
                    continue
                p = os.path.join(radice, nome)
                out.append((p, os.path.relpath(p, PROGETTO).replace(os.sep, '/')))
    return out


def rilascio_json(repo):
    return json.dumps({'repo': repo}, indent=2).encode() if repo else None


# ---------------------------------------------------------------- Linux
def aggiungi_cartella_node(tar, sorgente, nome):
    """Una cartella di Node (o il suo .tar.gz ufficiale) dentro l'archivio come <nome>/"""
    if os.path.isdir(sorgente):
        tar.add(sorgente, arcname=nome)
        return
    with tarfile.open(sorgente, 'r:*') as t:
        for m in t.getmembers():
            parti = m.name.split('/', 1)
            if len(parti) < 2 or not parti[1]:
                continue
            m2 = tarfile.TarInfo(nome + '/' + parti[1])
            m2.mode, m2.mtime, m2.type, m2.linkname, m2.size = m.mode, m.mtime, m.type, m.linkname, m.size
            tar.addfile(m2, t.extractfile(m) if m.isfile() else None)


def crea_linux(uscita, opz):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz', compresslevel=9) as tar:
        for disco, rel in file_programma():
            info = tar.gettarinfo(disco, 'app/' + rel)
            info.uid = info.gid = 0; info.uname = info.gname = ''
            info.mode = 0o644
            with open(disco, 'rb') as f:
                tar.addfile(info, f)
        rj = rilascio_json(opz.get('repo'))
        if rj:
            info = tarfile.TarInfo('app/rilascio.json'); info.size = len(rj); info.mode = 0o644
            tar.addfile(info, io.BytesIO(rj))
        for arch in ('x64', 'arm64'):
            if opz.get('node-linux-' + arch):
                aggiungi_cartella_node(tar, opz['node-linux-' + arch], 'node-linux-' + arch)
            if opz.get('link-linux-' + arch):
                info = tar.gettarinfo(opz['link-linux-' + arch], 'bin/uffa-link-linux-' + arch)
                info.mode = 0o755
                with open(opz['link-linux-' + arch], 'rb') as f:
                    tar.addfile(info, f)
    with open(os.path.join(QUI, 'linux', 'installa.sh'), 'rb') as f:
        testa = f.read()
    assert testa.endswith(b'__ARCHIVIO_QUI_SOTTO__\n'), 'installa.sh deve finire con il segnaposto'
    with open(uscita, 'wb') as out:
        out.write(testa)
        out.write(buf.getvalue())
    os.chmod(uscita, 0o755)
    return os.path.getsize(uscita)


# ---------------------------------------------------------------- Windows
def crea_windows(uscita, opz):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for disco, rel in file_programma():
            z.write(disco, 'app/' + rel)
        rj = rilascio_json(opz.get('repo'))
        if rj:
            z.writestr('app/rilascio.json', rj)
        if opz.get('node-win-x64'):
            sorg = opz['node-win-x64']
            if os.path.isdir(sorg):
                for radice, _, files in os.walk(sorg):
                    for n in files:
                        p = os.path.join(radice, n)
                        z.write(p, 'node-win-x64/' + os.path.relpath(p, sorg).replace(os.sep, '/'))
            else:
                with zipfile.ZipFile(sorg) as zn:
                    for info in zn.infolist():
                        parti = info.filename.split('/', 1)
                        if len(parti) == 2 and parti[1] and not info.is_dir():
                            z.writestr('node-win-x64/' + parti[1], zn.read(info))
        if opz.get('link-win-x64'):
            z.write(opz['link-win-x64'], 'bin/uffa-link-windows-x64.exe')
    dati = base64.b64encode(buf.getvalue()).decode('ascii')
    righe = '\r\n'.join(dati[i:i + 120] for i in range(0, len(dati), 120))
    with open(os.path.join(QUI, 'windows', 'installa.cmd'), 'r', encoding='utf-8') as f:
        testa = f.read()
    with open(os.path.join(QUI, 'windows', 'installa.ps1'), 'r', encoding='utf-8') as f:
        ps1 = f.read()
    with open(os.path.join(QUI, 'windows', 'avvia.ps1'), 'r', encoding='utf-8') as f:
        ps1 = ps1.replace('#<<AVVIA>>', f.read().rstrip('\n'))      # una sola fonte, anche per setup.exe
    assert '#<<AVVIA>>' not in ps1
    assert '#<<PS1>>' in testa
    testo = testa.replace('#<<PS1>>', ps1.replace('\n', '\r\n').rstrip()) + '\r\n::ARCHIVIO::\r\n' + righe + '\r\n'
    # UTF-8 SENZA BOM: con il BOM cmd.exe non capirebbe la prima riga. La parte PowerShell la
    # legge il preambolo come UTF-8 e la riscrive con il BOM, così le lettere accentate restano giuste.
    assert testo.split('#=INIZIO-PS=#')[0].isascii(), 'il preambolo per cmd deve essere solo ASCII'
    with open(uscita, 'w', encoding='utf-8', newline='') as f:
        f.write(testo.replace('\r\n', '\n').replace('\n', '\r\n'))
    return os.path.getsize(uscita)


# ---------------------------------------------------------------- cartella per Inno Setup (setup.exe)
def prepara_windows(dest, opz):
    """La stessa struttura che crea installa.ps1, pronta per essere impacchettata da Inno Setup."""
    if os.path.exists(dest):
        shutil.rmtree(dest)
    for disco, rel in file_programma():
        os.makedirs(os.path.dirname(os.path.join(dest, 'app', rel)), exist_ok=True)
        shutil.copyfile(disco, os.path.join(dest, 'app', rel))
    rj = rilascio_json(opz.get('repo'))
    if rj:
        with open(os.path.join(dest, 'app', 'rilascio.json'), 'wb') as f:
            f.write(rj)
    node = opz.get('node-win-x64')
    if node:
        nd = os.path.join(dest, 'runtime', 'node')
        if os.path.isdir(node):
            shutil.copytree(node, nd)
        else:
            with zipfile.ZipFile(node) as zn:
                for info in zn.infolist():
                    parti = info.filename.split('/', 1)
                    if len(parti) == 2 and parti[1] and not info.is_dir():
                        p = os.path.join(nd, *parti[1].split('/'))
                        os.makedirs(os.path.dirname(p), exist_ok=True)
                        with open(p, 'wb') as f:
                            f.write(zn.read(info))
    if opz.get('link-win-x64'):
        os.makedirs(os.path.join(dest, 'utente', 'bin'))
        shutil.copyfile(opz['link-win-x64'], os.path.join(dest, 'utente', 'bin', 'uffa-link.exe'))
    shutil.copyfile(os.path.join(QUI, 'windows', 'avvia.ps1'), os.path.join(dest, 'avvia.ps1'))


def main(argv):
    uscita = os.path.join(PROGETTO, 'installatori')
    opz = {}
    i = 0
    while i < len(argv):
        if argv[i].startswith('--'):
            opz[argv[i][2:]] = argv[i + 1]
            i += 2
        else:
            uscita = os.path.abspath(argv[i])
            i += 1
    if opz.get('stage-windows'):
        prepara_windows(os.path.abspath(opz['stage-windows']), opz)
        print('Cartella per Inno Setup: ' + opz['stage-windows'])
    os.makedirs(uscita, exist_ok=True)
    lx = os.path.join(uscita, 'Installa-LIBRE-VTT-Linux.sh')
    print('Linux:   %s (%.1f MB)' % (lx, crea_linux(lx, opz) / 1e6))
    if os.path.exists(os.path.join(QUI, 'windows', 'installa.ps1')):
        wn = os.path.join(uscita, 'Installa LIBRE VTT.cmd')
        print('Windows: %s (%.1f MB)' % (wn, crea_windows(wn, opz) / 1e6))


if __name__ == '__main__':
    main(sys.argv[1:])
