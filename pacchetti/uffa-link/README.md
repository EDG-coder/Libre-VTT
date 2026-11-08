# uffa-link

The P2P pipe between the master's machine and the players' ones. It uses [iroh](https://iroh.computer) (v1.3),
exactly like `iroh-ping`: n0's relay and discovery, so it also works behind NAT, without opening ports on the
router.

This program **knows nothing about the game**: it just moves bytes. Rules, permissions and dice rolls live in the
game server (`game-server.js`).

## Building (Mac and Crostini, same steps)

You need Rust >= 1.91:

    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    rustup update stable

On Crostini (Debian) you also need the build tools:

    sudo apt update && sudo apt install -y build-essential curl

Then, in this folder, on every machine taking part:

    cargo build --release

The binary ends up in `target/release/uffa-link`.

## Using it

**Master**, after starting the game server:

    ./target/release/uffa-link host

It prints a long ID: that is the session key, give it to the players (chat, message, however you like).

**Player**:

    ./target/release/uffa-link join <ID>

Then open the VTT in the browser as usual.

## How the ports are arranged

                 master's machine                          player's machine
    browser ─ws→ game-server.js :4000                     browser ─ws→ game-server.js :4000 («join» mode)
                 game-server.js :4010 (TCP) ←─ uffa-link host                     │
                                                 ↑                                 ↓
                                              iroh  ←───────────────→  uffa-link join :4010

The browser only ever talks to `127.0.0.1:4000`, on both the master's and the player's side.

## Notes

- Both sides need internet (n0's relay and discovery for hole punching).
- **The ID changes at every `host` start**: that is normal, give it to the players again at every session.
  Permissions stay, though, because the game server recognises players by the token it gave them the first time,
  not by the iroh ID.
- If the game server is off, `uffa-link host` says so and refuses the connection.
- If iroh cannot get through a network, the apps can use the relay instead (⚙ Settings › Advanced settings ›
  «Connection between apps», see [docs/sito-web.md](../../docs/sito-web.md)).
