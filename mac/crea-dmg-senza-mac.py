#!/usr/bin/env python3
"""Crea «LIBRE VTT.dmg» anche senza un Mac (da Linux o Windows, basta Python 3).

Prepara l'app «tutto dentro» (il programma in LIBRE VTT.app/Contents/Resources/app) e la mette in
un'immagine disco ISO 9660 con le estensioni Rock Ridge, che macOS apre con un doppio clic come
qualsiasi .dmg e che conserva nomi lunghi, permessi (il file che avvia l'app deve restare
eseguibile) e il collegamento «Applicazioni» verso cui trascinare l'app.

Su un Mac conviene usare crea-dmg.sh, che fa un .dmg compresso con gli strumenti di Apple e
può mettere dentro anche Node e il collegamento a distanza già compilato.

    python3 mac/crea-dmg-senza-mac.py [uscita.dmg] [--node-arm64 node] [--node-x64 node] [--uffa-link bin] [--repo utente/progetto]
"""
import datetime
import fnmatch
import os
import shutil
import stat
import struct
import sys
import tempfile

QUI = os.path.dirname(os.path.abspath(__file__))
PROGETTO = os.path.dirname(QUI)
SECTOR = 2048

# ---------------------------------------------------------------- l'app
# Quello che va dentro l'app: i file del programma, non le campagne di chi la costruisce.
PROGRAMMA = ['*.html', '*.js', '*.css', 'favicon.svg', 'package.json']
EXTRA = [('assets/Sfondi/main.webp', 'assets/Sfondi/main.webp'),     # la schermata di benvenuto
         ('uffa-link/Cargo.toml', 'uffa-link/Cargo.toml'),             # per compilare il collegamento
         ('uffa-link/Cargo.lock', 'uffa-link/Cargo.lock')]


def prepara_app(stage, node_arm64=None, node_x64=None, uffa_link=None, repo=None):
    app = os.path.join(stage, 'LIBRE VTT.app')
    c = os.path.join(app, 'Contents')
    res = os.path.join(c, 'Resources')
    dest = os.path.join(res, 'app')
    os.makedirs(os.path.join(c, 'MacOS'))
    os.makedirs(dest)
    shutil.copyfile(os.path.join(QUI, 'Info.plist'), os.path.join(c, 'Info.plist'))
    shutil.copyfile(os.path.join(QUI, 'myvtt'), os.path.join(c, 'MacOS', 'myvtt'))
    os.chmod(os.path.join(c, 'MacOS', 'myvtt'), 0o755)
    shutil.copyfile(os.path.join(QUI, 'AppIcon.icns'), os.path.join(res, 'AppIcon.icns'))
    n = 0
    for nome in sorted(os.listdir(PROGETTO)):
        p = os.path.join(PROGETTO, nome)
        if os.path.isfile(p) and any(fnmatch.fnmatch(nome, g) for g in PROGRAMMA):
            shutil.copyfile(p, os.path.join(dest, nome)); n += 1
    for da, a in EXTRA:
        p = os.path.join(PROGETTO, da)
        if os.path.isfile(p):
            os.makedirs(os.path.dirname(os.path.join(dest, a)), exist_ok=True)
            shutil.copyfile(p, os.path.join(dest, a)); n += 1
    src = os.path.join(PROGETTO, 'uffa-link', 'src')
    os.makedirs(os.path.join(dest, 'uffa-link', 'src'))
    for nome in sorted(os.listdir(src)):
        shutil.copyfile(os.path.join(src, nome), os.path.join(dest, 'uffa-link', 'src', nome)); n += 1
    for arch, bin_ in (('arm64', node_arm64), ('x64', node_x64)):
        if bin_:
            d = os.path.join(res, 'node', arch, 'bin')
            os.makedirs(d)
            shutil.copyfile(bin_, os.path.join(d, 'node'))
            os.chmod(os.path.join(d, 'node'), 0o755)
    if uffa_link:
        os.makedirs(os.path.join(dest, 'bin'))
        shutil.copyfile(uffa_link, os.path.join(dest, 'bin', 'uffa-link'))
        os.chmod(os.path.join(dest, 'bin', 'uffa-link'), 0o755)
    # da dove l'app scarica il collegamento a distanza già compilato (le uscite su GitHub)
    if repo:
        with open(os.path.join(dest, 'rilascio.json'), 'w', encoding='utf-8') as f:
            f.write('{\n  "repo": "%s"\n}\n' % repo)
    # il collegamento verso cui trascinare l'app
    os.symlink('/Applications', os.path.join(stage, 'Applicazioni'))
    return n


# ---------------------------------------------------------------- ISO 9660 + Rock Ridge
def both16(v):
    return struct.pack('<H', v) + struct.pack('>H', v)


def both32(v):
    return struct.pack('<I', v) + struct.pack('>I', v)


class Voce:
    def __init__(self, nome, tipo, mode, disco=None, dest=None):
        self.nome, self.tipo, self.mode, self.disco, self.dest = nome, tipo, mode, disco, dest
        self.figli, self.padre = [], None
        self.iso_id = b''
        self.extent = 0
        self.size = 0
        self.num = 0            # numero nella tabella dei percorsi (solo cartelle)


def albero(cartella, nome='', padre=None):
    v = Voce(nome, 'dir', 0o040755)
    v.padre = padre
    nomi = sorted(os.listdir(cartella))
    for i, n in enumerate(nomi, 1):
        p = os.path.join(cartella, n)
        st = os.lstat(p)
        if stat.S_ISLNK(st.st_mode):
            f = Voce(n, 'link', 0o120777, dest=os.readlink(p))
        elif stat.S_ISDIR(st.st_mode):
            f = albero(p, n, v)
        else:
            exe = st.st_mode & 0o111
            f = Voce(n, 'file', 0o100755 if exe else 0o100644, disco=p)
            f.size = st.st_size
        f.padre = v
        # nomi ISO brevi e unici, in ordine: quelli veri viaggiano in Rock Ridge (NM)
        f.iso_id = (b'N%07d' % i) if f.tipo == 'dir' else (b'N%07d.;1' % i)
        v.figli.append(f)
    return v


def links(d):
    return 2 + sum(1 for f in d.figli if f.tipo == 'dir')


def su_sp():
    return b'SP' + bytes([7, 1, 0xBE, 0xEF, 0])


def su_rr(flags):
    return b'RR' + bytes([5, 1, flags])


def su_px(mode, nlink):
    return b'PX' + bytes([36, 1]) + both32(mode) + both32(nlink) + both32(0) + both32(0)


def su_nm(nome):
    b = nome.encode('utf-8')
    return b'NM' + bytes([5 + len(b), 1, 0]) + b


def su_sl(dest):
    comp = b''
    parti = dest.split('/')
    if dest.startswith('/'):
        comp += bytes([0x08, 0])                 # radice
        parti = parti[1:]
    for p in parti:
        if p == '':
            continue
        if p == '.':
            comp += bytes([0x02, 0])
        elif p == '..':
            comp += bytes([0x04, 0])
        else:
            b = p.encode('utf-8')
            comp += bytes([0, len(b)]) + b
    return b'SL' + bytes([5 + len(comp), 1, 0]) + comp


def su_ce(blocco, offset, lung):
    return b'CE' + bytes([28, 1]) + both32(blocco) + both32(offset) + both32(lung)


def su_er():
    ident = b'RRIP_1991A'
    des = b'THE ROCK RIDGE INTERCHANGE PROTOCOL PROVIDES SUPPORT FOR POSIX FILE SYSTEM SEMANTICS'
    src = (b'PLEASE CONTACT DISC PUBLISHER FOR SPECIFICATION SOURCE.  SEE PUBLISHER IDENTIFIER IN '
           b'PRIMARY VOLUME DESCRIPTOR FOR CONTACT INFORMATION.')
    return b'ER' + bytes([8 + len(ident) + len(des) + len(src), 1, len(ident), len(des), len(src), 1]) + ident + des + src


RR_PX, RR_SL, RR_NM = 0x01, 0x04, 0x08


def record(extent, size, cartella, ident, su, data7):
    pad = b'\0' if len(ident) % 2 == 0 else b''
    lung = 33 + len(ident) + len(pad) + len(su)
    if lung % 2:
        su += b'\0'
        lung += 1
    if lung > 255:
        raise ValueError('nome troppo lungo per un solo record: %r' % ident)
    return (bytes([lung, 0]) + both32(extent) + both32(size) + data7 +
            bytes([0x02 if cartella else 0x00, 0, 0]) + both16(1) + bytes([len(ident)]) + ident + pad + su)


def records_di(d, er_blocco, data7):
    radice = d.padre is None
    padre = d.padre or d
    su_self = (su_sp() if radice else b'') + su_rr(RR_PX) + su_px(d.mode, links(d))
    if radice:
        su_self += su_ce(er_blocco, 0, len(su_er()))
    out = [record(d.extent, d.size, True, b'\0', su_self, data7),
           record(padre.extent, padre.size, True, b'\1', su_rr(RR_PX) + su_px(padre.mode, links(padre)), data7)]
    for f in d.figli:
        if f.tipo == 'dir':
            su = su_rr(RR_PX | RR_NM) + su_px(f.mode, links(f)) + su_nm(f.nome)
        elif f.tipo == 'link':
            su = su_rr(RR_PX | RR_NM | RR_SL) + su_px(f.mode, 1) + su_nm(f.nome) + su_sl(f.dest)
        else:
            su = su_rr(RR_PX | RR_NM) + su_px(f.mode, 1) + su_nm(f.nome)
        out.append(record(f.extent, f.size, f.tipo == 'dir', f.iso_id, su, data7))
    return out


def impagina(recs):
    """I record di una cartella, senza mai spezzarne uno a cavallo di due settori."""
    out = bytearray()
    for r in recs:
        if len(out) % SECTOR + len(r) > SECTOR:
            out += b'\0' * (SECTOR - len(out) % SECTOR)
        out += r
    if len(out) % SECTOR or not out:
        out += b'\0' * (SECTOR - len(out) % SECTOR)
    return bytes(out)


def scrivi_iso(stage, uscita, volume='LIBRE VTT'):
    radice = albero(stage)
    ora = datetime.datetime.now(datetime.timezone.utc)
    data7 = bytes([ora.year - 1900, ora.month, ora.day, ora.hour, ora.minute, ora.second, 0])
    data17 = ora.strftime('%Y%m%d%H%M%S00').encode() + b'\0'

    # cartelle in ordine per livelli (è l'ordine della tabella dei percorsi)
    cartelle, coda = [], [radice]
    while coda:
        d = coda.pop(0)
        cartelle.append(d)
        coda.extend(f for f in d.figli if f.tipo == 'dir')
    for i, d in enumerate(cartelle, 1):
        d.num = i

    # 16 settori vuoti, descrittore, terminatore, tabelle dei percorsi L e M, area di continuazione (ER)
    L_PT, M_PT, ER_BLK = 18, 19, 20
    prossimo = 21
    for d in cartelle:                                   # le misure non dipendono dalle posizioni
        d.size = len(impagina(records_di(d, ER_BLK, data7)))
    for d in cartelle:
        d.extent = prossimo
        prossimo += d.size // SECTOR
    file_ = []
    for d in cartelle:
        for f in d.figli:
            if f.tipo == 'file':
                f.extent = prossimo
                prossimo += max(1, -(-f.size // SECTOR))
                file_.append(f)
            elif f.tipo == 'link':
                f.extent, f.size = 0, 0
    totale = prossimo

    def tabella(le):
        out = bytearray()
        for d in cartelle:
            ident = b'\0' if d.padre is None else d.iso_id
            p = (d.padre or d).num
            out += bytes([len(ident), 0])
            out += struct.pack('<I' if le else '>I', d.extent) + struct.pack('<H' if le else '>H', p)
            out += ident + (b'\0' if len(ident) % 2 else b'')
        return bytes(out)
    lpt, mpt = tabella(True), tabella(False)
    if len(lpt) > SECTOR:
        raise ValueError('troppe cartelle per una tabella dei percorsi di un solo settore')

    def a(s, n):
        return s.encode('ascii')[:n].ljust(n, b' ')
    pvd = bytearray(SECTOR)
    pvd[0:7] = b'\x01CD001\x01'
    pvd[8:40] = a('MACOS', 32)
    pvd[40:72] = a(volume, 32)
    pvd[80:88] = both32(totale)
    pvd[120:124] = both16(1)
    pvd[124:128] = both16(1)
    pvd[128:132] = both16(SECTOR)
    pvd[132:140] = both32(len(lpt))
    pvd[140:144] = struct.pack('<I', L_PT)
    pvd[148:152] = struct.pack('>I', M_PT)
    root_rec = record(radice.extent, radice.size, True, b'\0', b'', data7)
    assert len(root_rec) == 34
    pvd[156:190] = root_rec
    pvd[190:318] = a('', 128)
    pvd[318:446] = a('LIBRE VTT', 128)
    pvd[446:574] = a('LIBRE VTT', 128)
    pvd[574:702] = a('LIBRE VTT - CREA-DMG-SENZA-MAC', 128)
    pvd[702:813] = a('', 111)
    pvd[813:830] = data17
    pvd[830:847] = data17
    pvd[847:864] = b'0000000000000000\0'
    pvd[864:881] = data17
    pvd[881] = 1
    term = bytearray(SECTOR)
    term[0:7] = b'\xffCD001\x01'

    with open(uscita, 'wb') as out:
        out.write(b'\0' * SECTOR * 16)
        out.write(pvd)
        out.write(term)
        out.write(lpt.ljust(SECTOR, b'\0'))
        out.write(mpt.ljust(SECTOR, b'\0'))
        out.write(su_er().ljust(SECTOR, b'\0'))
        for d in cartelle:
            blob = impagina(records_di(d, ER_BLK, data7))
            assert out.tell() == d.extent * SECTOR and len(blob) == d.size
            out.write(blob)
        for f in file_:
            assert out.tell() == f.extent * SECTOR
            with open(f.disco, 'rb') as src:
                dati = src.read()
            out.write(dati)
            resto = (-len(dati)) % SECTOR or (SECTOR if not dati else 0)
            out.write(b'\0' * resto)
        assert out.tell() == totale * SECTOR
    return totale * SECTOR


def main(argv):
    uscita = os.path.join(PROGETTO, 'LIBRE VTT.dmg')
    opz = {'--node-arm64': None, '--node-x64': None, '--uffa-link': None, '--repo': os.environ.get('MYVTT_REPO')}
    i = 0
    while i < len(argv):
        if argv[i] in opz:
            opz[argv[i]] = argv[i + 1]
            i += 2
        else:
            uscita = os.path.abspath(argv[i])
            i += 1
    stage = tempfile.mkdtemp(prefix='myvtt-dmg-')
    try:
        n = prepara_app(stage, opz['--node-arm64'], opz['--node-x64'], opz['--uffa-link'], opz['--repo'])
        byte = scrivi_iso(stage, uscita)
        print('Fatto: %s (%d file del programma, %.1f MB)' % (uscita, n, byte / 1e6))
        if not (opz['--node-arm64'] or opz['--node-x64']):
            print('Node non è dentro: la prima volta l\'app chiede il permesso e lo scarica da sola.')
    finally:
        shutil.rmtree(stage, ignore_errors=True)


if __name__ == '__main__':
    main(sys.argv[1:])
