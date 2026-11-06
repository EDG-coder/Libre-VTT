#!/usr/bin/env python3
"""Crea gli installatori di LIBRE VTT, ognuno in un solo file.

    python3 pacchetti/installer/crea-installer.py [cartella-uscita]

Produce:
    Installa-LIBRE-VTT-Linux.sh    script con il programma dentro (si estrae da solo)
    Installa-LIBRE-VTT-Linux-<processore>.sh   lo stesso, con dentro Node solo per quel processore
                                (x64, arm64, riscv64): uno per ogni Node passato qui sotto
    Installa LIBRE VTT.cmd         per Windows: doppio clic, finestra grafica (PowerShell + WinForms,
                                che ci sono in ogni Windows 10/11)

Di Node si prende solo il programma «node» (e la sua licenza): npm, npx, corepack e le
intestazioni per compilare non servono a LIBRE VTT e pesavano più della metà.

Così come sono, scaricano Node.js da nodejs.org durante l'installazione (e lo controllano).
Per installatori che non scaricano niente si possono mettere dentro Node e il collegamento
a distanza già compilato (è quello che fa GitHub Actions, vedi .github/workflows/rilascio.yml):

    --node-linux-x64 <cartella o .tar.gz>   --node-linux-arm64 <...>   --node-linux-riscv64 <...>
    --node-win-x64 <cartella o .zip>   --node-win-arm64 <...>
    --link-linux-x64 <file>   --link-linux-arm64 <file>   --link-linux-riscv64 <file>
    --link-win-x64 <file.exe>   --link-win-arm64 <file.exe>
    --repo utente/progetto    (scritto in rilascio.json: l'app saprà dove scaricare il collegamento)
    --stage-windows <cartella>   prepara anche i file per setup.exe (pacchetti/installer/windows/libre-vtt.iss)
"""
import fnmatch
import io
import lzma
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
CARTELLE = ['server', 'condiviso', 'web', 'sistemi', 'examples']             # tutto quello che c'è dentro
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
# Di Node serve solo il programma (bin/node, node.exe) e la sua licenza
NODE_LINUX = ('bin/node', 'LICENSE')
NODE_WIN = ('node.exe', 'LICENSE')


def file_node(sorgente, tieni):
    """[(percorso dentro Node, dati, permessi)] dei soli file in «tieni», da una cartella di Node
    o dal suo archivio ufficiale (.tar.gz/.tar.xz/.zip, con la cartella node-vX-... in cima)."""
    out = []
    if os.path.isdir(sorgente):
        for rel in tieni:
            p = os.path.join(sorgente, *rel.split('/'))
            if os.path.isfile(p):
                with open(p, 'rb') as f:
                    out.append((rel, f.read(), os.stat(p).st_mode & 0o777))
    elif zipfile.is_zipfile(sorgente):
        with zipfile.ZipFile(sorgente) as zn:
            for info in zn.infolist():
                parti = info.filename.split('/', 1)
                if len(parti) == 2 and parti[1] in tieni:
                    out.append((parti[1], zn.read(info), 0o755 if parti[1].endswith(('node', '.exe')) else 0o644))
    else:
        with tarfile.open(sorgente, 'r:*') as t:
            for m in t.getmembers():
                parti = m.name.split('/', 1)
                if len(parti) == 2 and parti[1] in tieni and m.isfile():
                    out.append((parti[1], t.extractfile(m).read(), m.mode & 0o777))
    trovati = {rel for rel, _, _ in out}
    assert tieni[0] in trovati, 'in %s non trovo %s' % (sorgente, tieni[0])
    return out


def aggiungi_cartella_node(tar, sorgente, nome):
    """Il Node (solo bin/node e la licenza) dentro l'archivio come <nome>/"""
    for rel, dati, modo in file_node(sorgente, NODE_LINUX):
        info = tarfile.TarInfo(nome + '/' + rel)
        info.size, info.mode, info.mtime = len(dati), modo or 0o644, 0
        tar.addfile(info, io.BytesIO(dati))


ARCH_LINUX = ('x64', 'arm64', 'riscv64')


def crea_linux(uscita, opz, archs=ARCH_LINUX):
    """archs: per quali processori mettere dentro Node e il collegamento (gli altri, se servono,
    li scarica l'installatore da nodejs.org / l'app da GitHub, come sempre)."""
    buf = io.BytesIO()
    # xz (LZMA) al posto di gzip: Node si comprime quasi del doppio. Il dizionario da 64 MB
    # (livello 9) per estrarre chiede circa 65 MB di memoria: ci stanno anche le schedine.
    with tarfile.open(fileobj=buf, mode='w:xz', preset=9 | lzma.PRESET_EXTREME) as tar:
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
        inclusi = []
        for arch in archs:
            if opz.get('node-linux-' + arch):
                aggiungi_cartella_node(tar, opz['node-linux-' + arch], 'node-linux-' + arch)
                inclusi.append(arch)
            if opz.get('link-linux-' + arch):
                info = tar.gettarinfo(opz['link-linux-' + arch], 'bin/uffa-link-linux-' + arch)
                info.mode = 0o755
                with open(opz['link-linux-' + arch], 'rb') as f:
                    tar.addfile(info, f)
    with open(os.path.join(QUI, 'linux', 'installa.sh'), 'rb') as f:
        testa = f.read()
    assert testa.endswith(b'__ARCHIVIO_QUI_SOTTO__\n'), 'installa.sh deve finire con il segnaposto'
    # quali Node ci sono dentro: l'installatore lo sa senza dover aprire tutto l'archivio
    assert testa.count(b'__NODE_INCLUSI__') == 1, 'installa.sh deve avere il segnaposto __NODE_INCLUSI__'
    testa = testa.replace(b'__NODE_INCLUSI__', ' '.join(inclusi).encode())
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
        for arch in ('x64', 'arm64'):              # installa.ps1 prende quello del processore (ARM: il suo, se c'è)
            sorg = opz.get('node-win-' + arch)
            if sorg:
                for rel, dati, _ in file_node(sorg, NODE_WIN):
                    z.writestr('node-win-%s/' % arch + rel, dati)
            if opz.get('link-win-' + arch):
                z.write(opz['link-win-' + arch], 'bin/uffa-link-windows-%s.exe' % arch)
    with open(os.path.join(QUI, 'windows', 'installa.cmd'), 'r', encoding='utf-8') as f:
        testa = f.read()
    with open(os.path.join(QUI, 'windows', 'installa.ps1'), 'r', encoding='utf-8') as f:
        ps1 = f.read()
    with open(os.path.join(QUI, 'windows', 'avvia.ps1'), 'r', encoding='utf-8') as f:
        ps1 = ps1.replace('#<<AVVIA>>', f.read().rstrip('\n'))      # una sola fonte, anche per setup.exe
    assert '#<<AVVIA>>' not in ps1
    assert '#<<PS1>>' in testa
    testo = testa.replace('#<<PS1>>', ps1.replace('\n', '\r\n').rstrip()) + '\r\n::ARCHIVIO::\r\n'
    # UTF-8 SENZA BOM: con il BOM cmd.exe non capirebbe la prima riga. La parte PowerShell la
    # legge il preambolo come UTF-8 e la riscrive con il BOM, così le lettere accentate restano giuste.
    assert testo.split('#=INIZIO-PS=#')[0].isascii(), 'il preambolo per cmd deve essere solo ASCII'
    dati = testo.replace('\r\n', '\n').replace('\n', '\r\n').encode('utf-8')
    # Il pacchetto .zip va attaccato così com'è, dopo il testo (prima era in base64, un terzo più
    # grosso): cmd.exe si ferma a «exit /b» e non lo legge mai. Il punto in cui comincia lo
    # scrive qui, al posto di LIBRE_INIZIO=0000000000 (stessa lunghezza, quindi il conto torna).
    segnaposto = b'LIBRE_INIZIO=0000000000'
    assert dati.count(segnaposto) == 1, 'installa.cmd deve avere LIBRE_INIZIO=0000000000 una volta sola'
    dati = dati.replace(segnaposto, b'LIBRE_INIZIO=%010d' % len(dati))
    with open(uscita, 'wb') as f:
        f.write(dati)
        f.write(buf.getvalue())
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
    # un Node e un collegamento per processore: setup.exe installa quelli giusti (vedi Check: in libre-vtt.iss)
    for arch in ('x64', 'arm64'):
        node = opz.get('node-win-' + arch)
        if node:
            nd = os.path.join(dest, 'runtime-' + arch, 'node')
            for rel, dati, _ in file_node(node, NODE_WIN):
                os.makedirs(nd, exist_ok=True)
                with open(os.path.join(nd, rel), 'wb') as f:
                    f.write(dati)
        if opz.get('link-win-' + arch):
            os.makedirs(os.path.join(dest, 'bin-' + arch), exist_ok=True)
            shutil.copyfile(opz['link-win-' + arch], os.path.join(dest, 'bin-' + arch, 'uffa-link.exe'))
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
    # uno per processore: più leggero, per chi sa quale gli serve (e per gli aggiornamenti dall'app)
    if sum(1 for a in ARCH_LINUX if opz.get('node-linux-' + a)) > 1:
        for arch in ARCH_LINUX:
            if opz.get('node-linux-' + arch):
                la = os.path.join(uscita, 'Installa-LIBRE-VTT-Linux-%s.sh' % arch)
                print('Linux:   %s (%.1f MB)' % (la, crea_linux(la, opz, (arch,)) / 1e6))
    if os.path.exists(os.path.join(QUI, 'windows', 'installa.ps1')):
        wn = os.path.join(uscita, 'Installa LIBRE VTT.cmd')
        print('Windows: %s (%.1f MB)' % (wn, crea_windows(wn, opz) / 1e6))


if __name__ == '__main__':
    main(sys.argv[1:])
