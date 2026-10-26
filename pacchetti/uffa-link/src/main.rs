//! Il tubo, come programma per il computer (la logica sta in lib.rs).
//!
//!   uffa-link host               resta in ascolto su iroh e stampa l'ID da condividere
//!   uffa-link join <ID>          si collega a quell'ID e apre la porta locale
//!
//! Opzione comune:
//!   --port <n>    porta locale del server di gioco (predefinita: 4010)
//!
//! L'ID finisce anche nel file «uffa-link.id» della cartella di lavoro (lo legge il pannello).

use std::sync::Arc;

use n0_error::Result;

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

/// Sul computer le righe vanno sullo schermo, come sempre.
struct Schermo;

impl uffa_link::Voce for Schermo {
    fn di(&self, riga: &str) { println!("{riga}"); }
    fn errore(&self, riga: &str) { eprintln!("{riga}"); }
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = match parse_args() { Some(a) => a, None => usage() };
    let voce: Arc<dyn uffa_link::Voce> = Arc::new(Schermo);
    let ctrl_c = async { let _ = tokio::signal::ctrl_c().await; };
    match args.mode.as_str() {
        "host" => uffa_link::host(args.port, ".".into(), voce, ctrl_c).await,
        "join" => match args.id.clone() {
            Some(id) => uffa_link::join(&id, args.port, voce, ctrl_c).await,
            None => usage(),
        },
        _ => usage(),
    }
}
