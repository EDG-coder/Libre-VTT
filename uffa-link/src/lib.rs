//! Il tubo: porta i byte del gioco da una macchina all'altra passando per iroh.
//!
//! Non sa niente del gioco. Da una parte parla con il server locale (TCP), dall'altra con
//! l'altra macchina (iroh). Tutto quello che entra da un lato esce dall'altro.
//!
//! Si usa in due modi:
//!   - sul computer, come programma (`src/main.rs`): `uffa-link host` / `uffa-link join <ID>`;
//!   - sui telefoni, come libreria dentro l'app: l'app chiama [`avvia_controllo`] (o, da C,
//!     `uffa_link_avvia`; su Android `Nativo.avviaCollegamento`) e l'avviatore apre e chiude
//!     le sessioni dalla porta di controllo (vedi `controllo.rs`).
//!
//! In «host» ogni connessione che arriva da iroh viene aperta verso 127.0.0.1:<porta>.
//! In «join» ogni connessione che arriva su 127.0.0.1:<porta> viene portata all'host.
//!
//! Nota: come in iroh-ping, l'ID cambia a ogni avvio. Chi gioca si riconosce per via del
//! gettone che il server di gioco gli dà la prima volta, non per via dell'ID: i permessi
//! quindi restano anche se l'ID cambia.

pub mod controllo;

use std::future::Future;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use iroh::{
    Endpoint, EndpointId,
    endpoint::{Connection, RecvStream, SendStream, presets},
    protocol::{AcceptError, ProtocolHandler, Router},
};
use n0_error::{Result, StdResultExt};
use tokio::io::AsyncWriteExt;
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};
use tokio::net::{TcpListener, TcpStream};

/// Le due parti devono usare lo stesso ALPN, altrimenti non si parlano.
pub const ALPN: &[u8] = b"uffa-vtt/1";

/// Dove vanno i messaggi: sullo schermo (programma) o all'avviatore (app per telefono).
pub trait Voce: Send + Sync + 'static {
    /// Una riga normale (sul computer: lo schermo).
    fn di(&self, riga: &str);
    /// Una riga d'errore.
    fn errore(&self, riga: &str);
}

// ======================= Lato host =======================

#[derive(Clone)]
struct Pipe {
    local: SocketAddr,
    voce: Arc<dyn Voce>,
}

impl std::fmt::Debug for Pipe {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Pipe").field("local", &self.local).finish()
    }
}

impl ProtocolHandler for Pipe {
    async fn accept(&self, connection: Connection) -> Result<(), AcceptError> {
        let who = connection.remote_id();
        self.voce.di(&format!("→ si è collegato {who}"));

        let (send, recv) = connection.accept_bi().await?;

        let tcp = match TcpStream::connect(self.local).await {
            Ok(t) => t,
            Err(e) => {
                self.voce.errore(&format!("Non riesco a parlare col server di gioco su {}: {e}", self.local));
                self.voce.errore("Il server di gioco è acceso? (node game-server.js host)");
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
            self.voce.errore(&format!("Errore scrivendo al server di gioco: {e}"));
            return Ok(());
        }

        pump(recv, send, tcp_read, tcp_write).await;
        self.voce.di(&format!("← se n'è andato {who}"));
        connection.close(0u32.into(), b"ciao");
        Ok(())
    }
}

/// Apre la sessione e resta in ascolto finché `fermo` non si compie.
/// L'ID da dare ai giocatori finisce anche in `<cartella>/uffa-link.id` (lo legge il pannello).
pub async fn host(porta: u16, cartella: PathBuf, voce: Arc<dyn Voce>, fermo: impl Future<Output = ()>) -> Result<()> {
    let local: SocketAddr = format!("127.0.0.1:{porta}").parse().anyerr()?;
    let endpoint = Endpoint::bind(presets::N0).await?;
    let router = Router::builder(endpoint).accept(ALPN, Pipe { local, voce: voce.clone() }).spawn();

    // Serve per farsi trovare da fuori.
    router.endpoint().online().await;

    let id = router.endpoint().id();
    let file_id = cartella.join("uffa-link.id");
    let _ = std::fs::write(&file_id, id.to_string());
    voce.di("");
    voce.di("  Sessione aperta. Questo è l'ID da dare ai giocatori:");
    voce.di("");
    voce.di(&format!("      {id}"));
    voce.di("");
    voce.di(&format!("  Loro lanceranno:  uffa-link join {id}"));
    voce.di(&format!("  Il gioco gira su 127.0.0.1:{porta}"));
    voce.di("  (Ctrl+C per chiudere la sessione)");
    voce.di("");

    fermo.await;
    let _ = std::fs::remove_file(&file_id);
    router.shutdown().await.anyerr()?;
    Ok(())
}

// ======================= Lato giocatore =======================

/// Apre 127.0.0.1:<porta> e porta all'host ogni connessione che ci arriva, finché `fermo` non si compie.
pub async fn join(id: &str, porta: u16, voce: Arc<dyn Voce>, fermo: impl Future<Output = ()>) -> Result<()> {
    let remote: EndpointId = id.trim().parse().anyerr()?;
    let endpoint = Endpoint::bind(presets::N0).await?;

    let listen: SocketAddr = format!("127.0.0.1:{porta}").parse().anyerr()?;
    let listener = TcpListener::bind(listen).await.anyerr()?;
    voce.di("");
    voce.di(&format!("  In attesa del gioco su 127.0.0.1:{porta}"));
    voce.di(&format!("  Mi collegherò a {remote}"));
    voce.di("  (Ctrl+C per uscire)");
    voce.di("");

    tokio::pin!(fermo);
    loop {
        let (tcp, _) = tokio::select! {
            r = listener.accept() => r.anyerr()?,
            _ = &mut fermo => break,
        };
        let _ = tcp.set_nodelay(true);
        let ep = endpoint.clone();
        let voce = voce.clone();

        tokio::spawn(async move {
            voce.di("→ mi collego alla sessione…");
            let conn = match tokio::time::timeout(Duration::from_secs(30), ep.connect(remote, ALPN)).await {
                Ok(Ok(c)) => c,
                Ok(Err(e)) => { voce.errore(&format!("Non riesco a collegarmi: {e}")); return; }
                Err(_) => { voce.errore("Non riesco a collegarmi: tempo scaduto (l'host è acceso?)"); return; }
            };
            let (send, recv) = match conn.open_bi().await {
                Ok(x) => x,
                Err(e) => { voce.errore(&format!("Collegamento interrotto: {e}")); return; }
            };
            voce.di("  collegato!");

            let (tcp_read, tcp_write) = tcp.into_split();
            pump(recv, send, tcp_read, tcp_write).await;

            voce.di("← collegamento chiuso");
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

// ======================= Dentro le app per telefono =======================

/// Le righe vanno all'avviatore attraverso la porta di controllo.
struct VoceApp(controllo::Uscita);

impl Voce for VoceApp {
    fn di(&self, riga: &str) { self.0.riga('L', riga); }
    fn errore(&self, riga: &str) { self.0.riga('E', riga); }
}

/// Il motore vero della porta di controllo: ogni sessione gira sul runtime di tokio dell'app.
struct MotoreIroh {
    rt: tokio::runtime::Runtime,
}

impl controllo::Motore for MotoreIroh {
    fn avvia(&self, comando: controllo::Comando, uscita: controllo::Uscita, fine: Box<dyn FnOnce(i32) + Send>) -> Box<dyn FnOnce() + Send> {
        let (stop, attesa) = tokio::sync::oneshot::channel::<()>();
        let voce: Arc<dyn Voce> = Arc::new(VoceApp(uscita));
        self.rt.spawn(async move {
            // si ferma quando l'avviatore lo chiede (o se ne va: il mittente sparisce)
            let fermo = async move { let _ = attesa.await; };
            let esito = match comando {
                controllo::Comando::Host { porta, cartella } => host(porta, PathBuf::from(cartella), voce.clone(), fermo).await,
                controllo::Comando::Join { id, porta } => join(&id, porta, voce.clone(), fermo).await,
            };
            if let Err(e) = &esito {
                voce.errore(&format!("{e}"));
            }
            fine(if esito.is_ok() { 0 } else { 1 });
        });
        Box::new(move || { let _ = stop.send(()); })
    }
}

/// Accende la porta di controllo (una volta sola per processo) e ne restituisce il numero.
/// 0 se non è stato possibile. `segreto` è la parola che l'avviatore deve mettere davanti ai comandi.
pub fn avvia_controllo(segreto: String) -> u16 {
    static PORTA: std::sync::OnceLock<u16> = std::sync::OnceLock::new();
    *PORTA.get_or_init(|| {
        let rt = match tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .thread_name("uffa-link")
            .enable_all()
            .build()
        {
            Ok(rt) => rt,
            Err(_) => return 0,
        };
        controllo::avvia(Arc::new(MotoreIroh { rt }), segreto).unwrap_or(0)
    })
}

/// Per iOS (e per chiunque lo usi da C): vedi `include/uffa_link.h`.
///
/// # Safety
/// `segreto` deve essere NULL oppure una stringa C valida terminata da zero.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uffa_link_avvia(segreto: *const std::ffi::c_char) -> u16 {
    let s = if segreto.is_null() {
        String::new()
    } else {
        unsafe { std::ffi::CStr::from_ptr(segreto) }.to_string_lossy().into_owned()
    };
    std::panic::catch_unwind(move || avvia_controllo(s)).unwrap_or(0)
}

/// Android: `app.librevtt.Nativo.avviaCollegamento(Context, String)`.
/// Prima di accendere il tubo si dà a iroh il modo di leggere i DNS del telefono (via JNI);
/// senza, userebbe dei server DNS pubblici al loro posto.
#[cfg(target_os = "android")]
mod android {
    use jni::JNIEnv;
    use jni::objects::{JClass, JObject, JString};
    use jni::sys::jint;

    #[unsafe(no_mangle)]
    pub extern "system" fn Java_app_librevtt_Nativo_avviaCollegamento<'l>(
        mut env: JNIEnv<'l>,
        _classe: JClass<'l>,
        contesto: JObject<'l>,
        segreto: JString<'l>,
    ) -> jint {
        let segreto: String = env.get_string(&segreto).map(|s| s.into()).unwrap_or_default();
        if let (Ok(vm), Ok(globale)) = (env.get_java_vm(), env.new_global_ref(&contesto)) {
            let vm = vm.get_java_vm_pointer() as *mut std::ffi::c_void;
            let ctx = globale.as_obj().as_raw() as *mut std::ffi::c_void;
            std::mem::forget(globale); // deve restare valido finché vive l'app
            unsafe { iroh::dns::install_android_jni_context(vm, ctx) };
        }
        std::panic::catch_unwind(move || super::avvia_controllo(segreto)).unwrap_or(0) as jint
    }
}
