# uffa-link

Il tubo P2P fra la macchina del master e quelle dei giocatori. Usa
[iroh](https://iroh.computer) (v1.3), esattamente come `iroh-ping`: relay e discovery di n0,
quindi funziona anche dietro NAT, senza aprire porte sul router.

Questo programma **non sa niente del gioco**: sposta byte e basta. Le regole, i permessi e i
tiri di dado stanno nel server di gioco (`game-server.js`).

## Compilare (Mac e Crostini, stesso procedimento)

Serve Rust >= 1.91:

    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    rustup update stable

Su Crostini (Debian) servono anche i tool di compilazione:

    sudo apt update && sudo apt install -y build-essential curl

Poi, in questa cartella, su ogni macchina che partecipa:

    cargo build --release

Il binario esce in `target/release/uffa-link`.

## Usare

**Master**, dopo aver avviato il server di gioco:

    ./target/release/uffa-link host

Stampa un ID lungo: è la chiave della sessione, passala ai giocatori (chat, messaggio, come vuoi).

**Giocatore**:

    ./target/release/uffa-link join <ID>

Poi apre il VTT nel browser come al solito.

## Come sono messe le porte

                 macchina del master                      macchina del giocatore
    browser ─ws→ game-server.js :4000                     browser ─ws→ game-server.js :4000 (modo «join»)
                 game-server.js :4010 (TCP) ←─ uffa-link host                     │
                                                 ↑                                 ↓
                                              iroh  ←───────────────→  uffa-link join :4010

Il browser parla sempre e solo con `127.0.0.1:4000`, sia dal lato master sia dal lato giocatore.

## Note

- Serve internet da tutte e due le parti (relay e discovery di n0 per l'hole punching).
- **L'ID cambia a ogni avvio di `host`**: è normale, va ridato ai giocatori a ogni sessione.
  I permessi però restano, perché il server di gioco riconosce i giocatori dal gettone che
  ha dato loro la prima volta, non dall'ID di iroh.
- Se il server di gioco è spento, `uffa-link host` lo dice e rifiuta il collegamento.
