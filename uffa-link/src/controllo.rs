//! La porta di controllo: come le app per telefono accendono e spengono il tubo.
//!
//! Sul computer il collegamento è un programma a sé (`uffa-link host`), che l'avviatore
//! lancia e ferma come qualsiasi altro. Su Android e su iPhone non si possono lanciare
//! programmi: il tubo vive dentro l'app, come libreria, e l'avviatore (che gira nella stessa
//! app) gli parla da una porta su 127.0.0.1.
//!
//! Il protocollo è fatto di righe di testo, una per messaggio.
//!
//! Dall'avviatore, la prima riga (il segreto lo sceglie l'app e lo conoscono solo lei e
//! l'avviatore: un'altra app sullo stesso telefono non può usare il tubo):
//!
//!   <segreto> host <porta> <cartella>      apre una sessione; l'ID va anche in <cartella>/uffa-link.id
//!   <segreto> join <ID> <porta>            si collega alla sessione <ID>
//!
//! Poi la connessione resta aperta finché dura la sessione. Chiuderla (o scrivere «stop»)
//! ferma la sessione. Nell'altro verso arrivano:
//!
//!   L <testo>      quello che la versione a riga di comando scriverebbe sullo schermo
//!   E <testo>      quello che scriverebbe come errore
//!   F <codice>     la sessione è finita da sola (0 = senza errori); poi la connessione si chiude
//!
//! Le righe «L» sono identiche a quelle del programma: l'avviatore ci trova l'ID allo stesso modo.
//!
//! Questo file usa solo la libreria standard, così lo si può provare senza iroh.

use std::io::{BufRead, BufReader, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;

/// Quello che l'avviatore chiede.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Comando {
    Host { porta: u16, cartella: String },
    Join { id: String, porta: u16 },
}

/// Legge la prima riga. `None` se non è un comando valido o se il segreto non torna.
pub fn leggi_comando(riga: &str, segreto: &str) -> Option<Comando> {
    let riga = riga.trim_end_matches(['\r', '\n']);
    let (chiave, resto) = riga.split_once(' ')?;
    if !uguali(chiave.as_bytes(), segreto.as_bytes()) {
        return None;
    }
    let mut parti = resto.splitn(3, ' ');
    match parti.next()? {
        "host" => {
            let porta = parti.next()?.trim().parse().ok()?;
            let cartella = parti.next().map(str::trim).filter(|c| !c.is_empty()).unwrap_or(".").to_string();
            Some(Comando::Host { porta, cartella })
        }
        "join" => {
            let id = parti.next()?.trim().to_string();
            let porta = parti.next()?.trim().parse().ok()?;
            if id.is_empty() {
                return None;
            }
            Some(Comando::Join { id, porta })
        }
        _ => None,
    }
}

/// Confronto che non si ferma al primo carattere diverso (non fa indovinare il segreto a pezzi).
fn uguali(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Dove scrivere le righe per l'avviatore. Si può copiare: tutte le copie scrivono sulla stessa connessione.
#[derive(Clone)]
pub struct Uscita(Arc<Mutex<TcpStream>>);

impl Uscita {
    /// Manda una riga del tipo dato ('L', 'E', 'F'). I ritorni a capo nel testo diventano spazi.
    pub fn riga(&self, tipo: char, testo: &str) {
        let pulito: String = testo.chars().map(|c| if c == '\n' || c == '\r' { ' ' } else { c }).collect();
        if let Ok(mut s) = self.0.lock() {
            let _ = s.write_all(format!("{tipo} {pulito}\n").as_bytes());
            let _ = s.flush();
        }
    }
    /// Chiude la connessione: l'avviatore capisce che la sessione è finita.
    pub fn chiudi(&self) {
        if let Ok(s) = self.0.lock() {
            let _ = s.shutdown(Shutdown::Both);
        }
    }
}

/// Chi fa davvero il lavoro: il tubo con iroh (vedi lib.rs), oppure uno finto nelle prove.
pub trait Motore: Send + Sync + 'static {
    /// Avvia la sessione e restituisce subito la funzione che la ferma.
    /// Quando la sessione finisce da sola, chiama `fine` con il codice di uscita.
    fn avvia(&self, comando: Comando, uscita: Uscita, fine: Box<dyn FnOnce(i32) + Send>) -> Box<dyn FnOnce() + Send>;
}

/// Accende la porta di controllo su 127.0.0.1 (una porta libera qualsiasi) e ne restituisce il numero.
/// Ogni connessione è una sessione, servita in un thread suo.
pub fn avvia(motore: Arc<dyn Motore>, segreto: String) -> std::io::Result<u16> {
    let ascolto = TcpListener::bind("127.0.0.1:0")?;
    let porta = ascolto.local_addr()?.port();
    let segreto = Arc::new(segreto);
    thread::Builder::new().name("uffa-link-controllo".into()).spawn(move || {
        for conn in ascolto.incoming() {
            let Ok(conn) = conn else { continue };
            let (m, s) = (motore.clone(), segreto.clone());
            let _ = thread::Builder::new().name("uffa-link-sessione".into()).spawn(move || servi(conn, m, &s));
        }
    })?;
    Ok(porta)
}

fn servi(conn: TcpStream, motore: Arc<dyn Motore>, segreto: &str) {
    let _ = conn.set_nodelay(true);
    let Ok(lettura) = conn.try_clone() else { return };
    let uscita = Uscita(Arc::new(Mutex::new(conn)));
    let mut righe = BufReader::new(lettura);
    let mut riga = String::new();
    if righe.read_line(&mut riga).unwrap_or(0) == 0 {
        return;
    }
    let Some(comando) = leggi_comando(&riga, segreto) else {
        uscita.riga('E', "Comando non valido.");
        uscita.riga('F', "2");
        uscita.chiudi();
        return;
    };
    let alla_fine = uscita.clone();
    let ferma = motore.avvia(
        comando,
        uscita.clone(),
        Box::new(move |codice| {
            alla_fine.riga('F', &codice.to_string());
            alla_fine.chiudi();
        }),
    );
    // La sessione dura finché l'avviatore tiene aperta la connessione (o scrive «stop»).
    loop {
        riga.clear();
        match righe.read_line(&mut riga) {
            Ok(0) | Err(_) => break,
            Ok(_) if riga.trim() == "stop" => break,
            Ok(_) => {}
        }
    }
    ferma();
    uscita.chiudi();
}

#[cfg(test)]
mod prove {
    use super::*;
    use std::io::Read;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    #[test]
    fn comandi() {
        assert_eq!(leggi_comando("abc host 4010 /dati/con spazi/ok\n", "abc"),
            Some(Comando::Host { porta: 4010, cartella: "/dati/con spazi/ok".into() }));
        assert_eq!(leggi_comando("abc host 4010\n", "abc"), Some(Comando::Host { porta: 4010, cartella: ".".into() }));
        assert_eq!(leggi_comando("abc join xyz123 4011\r\n", "abc"), Some(Comando::Join { id: "xyz123".into(), porta: 4011 }));
        assert_eq!(leggi_comando("abd host 4010 /x", "abc"), None, "segreto sbagliato");
        assert_eq!(leggi_comando("abc host 99999 /x", "abc"), None, "porta fuori misura");
        assert_eq!(leggi_comando("abc join  4011", "abc"), None);
        assert_eq!(leggi_comando("abc rompi", "abc"), None);
        assert_eq!(leggi_comando("", "abc"), None);
    }

    /// Un motore finto: scrive due righe, e «finisce da solo» se la porta è 1.
    struct Finto(Arc<AtomicUsize>);
    impl Motore for Finto {
        fn avvia(&self, c: Comando, u: Uscita, fine: Box<dyn FnOnce(i32) + Send>) -> Box<dyn FnOnce() + Send> {
            u.riga('L', "  Sessione aperta.\nseconda riga");
            u.riga('L', "      idfinto");
            let fermati = self.0.clone();
            if let Comando::Host { porta: 1, .. } = c {
                thread::spawn(move || { thread::sleep(Duration::from_millis(50)); fine(3) });
            }
            Box::new(move || { fermati.fetch_add(1, Ordering::SeqCst); })
        }
    }

    fn leggi_tutto(mut s: TcpStream) -> String {
        s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        let mut t = String::new();
        let _ = s.read_to_string(&mut t);
        t
    }

    #[test]
    fn sessione_fermata_dall_app() {
        let fermi = Arc::new(AtomicUsize::new(0));
        let porta = avvia(Arc::new(Finto(fermi.clone())), "s3gr3to".into()).unwrap();
        let mut c = TcpStream::connect(("127.0.0.1", porta)).unwrap();
        c.write_all(b"s3gr3to host 4010 /tmp/x\n").unwrap();
        thread::sleep(Duration::from_millis(100));
        c.write_all(b"stop\n").unwrap();
        let t = leggi_tutto(c);
        assert_eq!(t, "L   Sessione aperta. seconda riga\nL       idfinto\n");
        thread::sleep(Duration::from_millis(50));
        assert_eq!(fermi.load(Ordering::SeqCst), 1, "la sessione è stata fermata una volta");
    }

    #[test]
    fn sessione_finita_da_sola() {
        let porta = avvia(Arc::new(Finto(Arc::new(AtomicUsize::new(0)))), "k".into()).unwrap();
        let mut c = TcpStream::connect(("127.0.0.1", porta)).unwrap();
        c.write_all(b"k host 1 /tmp\n").unwrap();
        let t = leggi_tutto(c);
        assert!(t.ends_with("F 3\n"), "{t:?}");
    }

    #[test]
    fn segreto_sbagliato() {
        let fermi = Arc::new(AtomicUsize::new(0));
        let porta = avvia(Arc::new(Finto(fermi.clone())), "giusto".into()).unwrap();
        let mut c = TcpStream::connect(("127.0.0.1", porta)).unwrap();
        c.write_all(b"sbagliato host 4010 /tmp\n").unwrap();
        assert_eq!(leggi_tutto(c), "E Comando non valido.\nF 2\n");
        assert_eq!(fermi.load(Ordering::SeqCst), 0, "nessuna sessione partita");
    }
}
