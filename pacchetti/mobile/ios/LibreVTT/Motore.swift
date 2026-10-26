import Foundation
import Security

/// Accende, una volta sola, i due motori dell'app:
///   - il collegamento a distanza (libreria Rust), che apre la sua porta di controllo;
///   - Node.js, che esegue lo stesso avviatore del computer (launcher.js) in modalità «ios».
/// Quando l'avviatore è pronto scrive il suo indirizzo in un file: la finestra lo aspetta e lo apre.
///
/// Le cartelle:
///   LibreVTT.app/nodejs-project          il programma (sola lettura, va bene così)
///   Library/Application Support/utente   impostazioni, campagne recenti, file in arrivo e in uscita
///   Documents/Campagne                   le campagne: si vedono nell'app «File», in «Su iPhone/iPad»
enum Motore {
    private(set) static var segreto = ""
    private(set) static var pronto = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("pronto.txt")
    private(set) static var utente = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("utente")
    private(set) static var campagne = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("Campagne")
    private(set) static var avviato = false

    static func avvia() {
        if avviato { return }
        avviato = true
        let fm = FileManager.default
        let documenti = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let supporto = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let cache = fm.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        campagne = documenti.appendingPathComponent("Campagne", isDirectory: true)
        utente = supporto.appendingPathComponent("utente", isDirectory: true)
        pronto = cache.appendingPathComponent("pronto.txt")
        for d in [campagne, utente, cache] {
            try? fm.createDirectory(at: d, withIntermediateDirectories: true)
        }
        try? fm.removeItem(at: pronto)
        segreto = casuale()

        let porta = uffa_link_avvia(segreto)
        if porta == 0 { NSLog("LIBRE VTT: il collegamento a distanza non è partito") }

        setenv("HOME", NSHomeDirectory(), 1)
        setenv("TMPDIR", NSTemporaryDirectory(), 1)
        setenv("MYVTT_MOBILE", "ios", 1)
        setenv("MYVTT_USERDIR", utente.path, 1)
        setenv("MYVTT_CAMPAGNE", campagne.path, 1)
        setenv("MYVTT_LINK_CONTROLLO", String(porta), 1)
        setenv("MYVTT_SEGRETO", segreto, 1)
        setenv("MYVTT_PRONTO_FILE", pronto.path, 1)
        setenv("UI_PORT", "4100", 1)
        unsetenv("NODE_OPTIONS")

        guard let progetto = Bundle.main.url(forResource: "nodejs-project", withExtension: nil) else {
            NSLog("LIBRE VTT: manca la cartella nodejs-project nell'app (hai lanciato ios/prepara.sh?)")
            return
        }
        let script = progetto.appendingPathComponent("server").appendingPathComponent("launcher.js").path
        if avvio_node(script) != 0 { NSLog("LIBRE VTT: Node non è partito") }
    }

    private static func casuale() -> String {
        var b = [UInt8](repeating: 0, count: 24)
        if SecRandomCopyBytes(kSecRandomDefault, b.count, &b) != errSecSuccess {
            for i in b.indices { b[i] = UInt8.random(in: 0...255) }
        }
        return b.map { String(format: "%02x", $0) }.joined()
    }
}
