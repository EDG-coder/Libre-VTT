//! Il tubo: porta i byte del gioco da una macchina all'altra passando per iroh.
//!
//! Non sa niente del gioco. Da una parte parla con il server locale (TCP), dall'altra con
//! l'altra macchina (iroh). Tutto quello che entra da un lato esce dall'altro.
//!
//!   uffa-link host               resta in ascolto su iroh e stampa l'ID da condividere
//!   uffa-link join <ID>          si collega a quell'ID e apre la porta locale
//!
//! Opzione comune:
//!   --port <n>    porta locale del server di gioco (predefinita: 4010)
//!
//! In «host» ogni connessione che arriva da iroh viene aperta verso 127.0.0.1:<port>.
//! In «join» ogni connessione che arriva su 127.0.0.1:<port> viene portata all'host.
//!
//! Nota: come in iroh-ping, l'ID cambia a ogni avvio. Chi gioca si riconosce per via del
//! gettone che il server di gioco gli dà la prima volta, non per via dell'ID: i permessi
//! quindi restano anche se l'ID cambia.

use std::net::SocketAddr;
use std::time::Duration;

use iroh::{
    Endpoint, EndpointId,
    endpoint::{Connection, RecvStream, SendStream, presets},
    protocol::{AcceptError, ProtocolHandler, Router},
};
use n0_error::{Result, StdResultExt};
use tokio::io::AsyncWriteExt;
use tokio::net::{TcpListener, TcpStream};
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};

/// Le due parti devono usare lo stesso ALPN, altrimenti non si parlano.
const ALPN: &[u8] = b"uffa-vtt/1";

struct Args {
    mode: String,
    id: Option<String>,
    port: u16,
}

fn parse_args() -> Option<Args> {
    let raw: Vec<String> = std::env::args().skip(1).collect();
    let mut a = Args { mode: raw.first()?.clone(), id: None, port: 4010 };
    let mut i = 1;
    while i < raw.len() {
        match raw[i].as_str() {
            "--port" => { a.port = raw.get(i + 1)?.parse().ok()?; i += 2; }
            other if !other.starts_with("--") && a.id.is_none() => { a.id = Some(other.to_string()); i += 1; }
            _ => return None,
        }
    }
    Some(a)
}

fn usage() -> ! {
    eprintln!(
        "Uso:\n  \
         uffa-link host [--port 4010]\n  \
         uffa-link join <ID> [--port 4010]\n\n\
         L'host stampa un ID: passalo ai giocatori, che lo useranno con «join»."
    );
    std::process::exit(2)
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = match parse_args() { Some(a) => a, None => usage() };
    match args.mode.as_str() {
        "host" => host(args).await,
        "join" => match args.id.clone() {
            Some(id) => join(args, id).await,
            None => usage(),
        },
        _ => usage(),
    }
}

// ======================= Lato host =======================

#[derive(Debug, Clone)]
struct Pipe {
    local: SocketAddr,
}

impl ProtocolHandler for Pipe {
    async fn accept(&self, connection: Connection) -> Result<(), AcceptError> {
        let who = connection.remote_id();
        println!("→ si è collegato {who}");

        let (send, recv) = connection.accept_bi().await?;

        let tcp = match TcpStream::connect(self.local).await {
            Ok(t) => t,
            Err(e) => {
                eprintln!("Non riesco a parlare col server di gioco su {}: {e}", self.local);
                eprintln!("Il server di gioco è acceso? (node game-server.js host)");
                connection.close(1u32.into(), b"server di gioco spento");
                return Ok(());
            }
        };
        let _ = tcp.set_nodelay(true);
        let (tcp_read, mut tcp_write) = tcp.into_split();

        // Prima riga: chi si è collegato. Al server di gioco serve solo per scriverlo nel
        // registro; il riconoscimento vero avviene col gettone mandato dal browser.
        let hello = format!("{{\"t\":\"peer\",\"id\":\"{who}\"}}\n");
        if let Err(e) = tcp_write.write_all(hello.as_bytes()).await {
            eprintln!("Errore scrivendo al server di gioco: {e}");
            return Ok(());
        }

        pump(recv, send, tcp_read, tcp_write).await;
        println!("← se n'è andato {who}");
        connection.close(0u32.into(), b"ciao");
        Ok(())
    }
}

async fn host(args: Args) -> Result<()> {
    let local: SocketAddr = format!("127.0.0.1:{}", args.port).parse().anyerr()?;
    let endpoint = Endpoint::bind(presets::N0).await?;
    let router = Router::builder(endpoint).accept(ALPN, Pipe { local }).spawn();

    // Serve per farsi trovare da fuori.
    router.endpoint().online().await;

    let id = router.endpoint().id();
    // Il server di gioco legge questo file per mostrare l'ID nel pannello.
    let _ = std::fs::write("uffa-link.id", id.to_string());
    println!();
    println!("  Sessione aperta. Questo è l'ID da dare ai giocatori:");
    println!();
    println!("      {id}");
    println!();
    println!("  Loro lanceranno:  uffa-link join {id}");
    println!("  Il gioco gira su 127.0.0.1:{}", args.port);
    println!("  (Ctrl+C per chiudere la sessione)");
    println!();

    tokio::signal::ctrl_c().await.anyerr()?;
    let _ = std::fs::remove_file("uffa-link.id");
    router.shutdown().await.anyerr()?;
    Ok(())
}

// ======================= Lato giocatore =======================

async fn join(args: Args, id: String) -> Result<()> {
    let remote: EndpointId = id.trim().parse().anyerr()?;
    let endpoint = Endpoint::bind(presets::N0).await?;

    let listen: SocketAddr = format!("127.0.0.1:{}", args.port).parse().anyerr()?;
    let listener = TcpListener::bind(listen).await.anyerr()?;
    println!();
    println!("  In attesa del gioco su 127.0.0.1:{}", args.port);
    println!("  Mi collegherò a {remote}");
    println!("  (Ctrl+C per uscire)");
    println!();

    loop {
        let (tcp, _) = tokio::select! {
            r = listener.accept() => r.anyerr()?,
            _ = tokio::signal::ctrl_c() => break,
        };
        let _ = tcp.set_nodelay(true);
        let ep = endpoint.clone();

        tokio::spawn(async move {
            println!("→ mi collego alla sessione…");
            let conn = match tokio::time::timeout(Duration::from_secs(30), ep.connect(remote, ALPN)).await {
                Ok(Ok(c)) => c,
                Ok(Err(e)) => { eprintln!("Non riesco a collegarmi: {e}"); return; }
                Err(_) => { eprintln!("Non riesco a collegarmi: tempo scaduto (l'host è acceso?)"); return; }
            };
            let (send, recv) = match conn.open_bi().await {
                Ok(x) => x,
                Err(e) => { eprintln!("Collegamento interrotto: {e}"); return; }
            };
            println!("  collegato!");

            let (tcp_read, tcp_write) = tcp.into_split();
            pump(recv, send, tcp_read, tcp_write).await;

            println!("← collegamento chiuso");
            conn.close(0u32.into(), b"ciao");
        });
    }

    endpoint.close().await;
    Ok(())
}

// ======================= Il tubo vero e proprio =======================

/// Copia i byte nei due versi finché uno dei due lati non chiude.
async fn pump(mut recv: RecvStream, mut send: SendStream, mut tcp_read: OwnedReadHalf, mut tcp_write: OwnedWriteHalf) {
    let down = async move {
        let _ = tokio::io::copy(&mut recv, &mut tcp_write).await;   // da iroh al server locale
        let _ = tcp_write.shutdown().await;
    };
    let up = async move {
        let _ = tokio::io::copy(&mut tcp_read, &mut send).await;    // dal server locale a iroh
        let _ = send.finish();
    };
    tokio::join!(down, up);
}
