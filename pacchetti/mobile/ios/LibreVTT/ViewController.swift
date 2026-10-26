import UIKit
import WebKit
import GameController
import UniformTypeIdentifiers

/// L'unica finestra dell'app: una pagina web (la stessa del computer) che parla con il Node che
/// gira dentro l'app. Qui si aspetta che Node sia pronto, si gestiscono le finestre che la pagina
/// apre, gli avvisi (alert/confirm/prompt), il ponte con nativo.js e i cambi di mouse e tastiera.
final class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UIDocumentPickerDelegate {
    private var web: WKWebView!
    private let attesa = UIView()
    private let scritta = UILabel()
    private let inizio = Date()
    private var caricata = false
    private var timer: Timer?
    private var importaId: Int?
    private var importaCartella = false
    /// Il selettore dei documenti serve a tre cose: importare una campagna, salvare o aprire una scheda.
    private enum Scelta { case importa, salva(Int), apri(Int) }
    private var scelta: Scelta = .importa

    override var preferredStatusBarStyle: UIStatusBarStyle { .default }   // segue la modalità chiara/scura, come la pagina
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .bottom }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Colori.sfondo

        let conf = WKWebViewConfiguration()
        conf.allowsInlineMediaPlayback = true
        conf.mediaTypesRequiringUserActionForPlayback = []   // la musica parte quando la fa partire il master
        conf.preferences.javaScriptCanOpenWindowsAutomatically = true
        conf.applicationNameForUserAgent = "Mobile/15E148 LibreVTT-iOS"
        let uc = WKUserContentController()
        uc.add(PonteDebole(self), name: "libre")
        uc.addUserScript(WKUserScript(source: "window.__LIBRE_INFO__=" + ViewController.json(ViewController.info()) + ";",
                                      injectionTime: .atDocumentStart, forMainFrameOnly: true))
        conf.userContentController = uc

        web = WKWebView(frame: view.bounds, configuration: conf)
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        web.isOpaque = false
        web.backgroundColor = Colori.sfondo
        web.scrollView.backgroundColor = Colori.sfondo
        web.scrollView.contentInsetAdjustmentBehavior = .never   // i margini (tacca, barra in basso) li gestisce la pagina
        web.scrollView.bounces = false
        web.allowsLinkPreview = false
        web.allowsBackForwardNavigationGestures = false
        web.navigationDelegate = self
        web.uiDelegate = self
        if #available(iOS 16.4, *) { web.isInspectable = true }
        view.addSubview(web)

        costruisciAttesa()

        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(cambiato), name: .GCMouseDidConnect, object: nil)
        nc.addObserver(self, selector: #selector(cambiato), name: .GCMouseDidDisconnect, object: nil)
        nc.addObserver(self, selector: #selector(cambiato), name: .GCKeyboardDidConnect, object: nil)
        nc.addObserver(self, selector: #selector(cambiato), name: .GCKeyboardDidDisconnect, object: nil)

        timer = Timer.scheduledTimer(timeInterval: 0.15, target: self, selector: #selector(controllaPronto), userInfo: nil, repeats: true)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - attesa di Node

    private func costruisciAttesa() {
        attesa.frame = view.bounds
        attesa.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        attesa.backgroundColor = Colori.sfondo

        let titolo = UILabel()
        titolo.text = "LIBRE VTT"
        titolo.textColor = .label
        titolo.font = UIFont.systemFont(ofSize: 30, weight: .heavy)
        let giro = UIActivityIndicatorView(style: .large)
        giro.color = .secondaryLabel
        giro.startAnimating()
        scritta.text = "Sto preparando il tavolo da gioco…"
        scritta.textColor = .secondaryLabel
        scritta.font = UIFont.systemFont(ofSize: 15)
        scritta.numberOfLines = 0
        scritta.textAlignment = .center

        let pila = UIStackView(arrangedSubviews: [titolo, giro, scritta])
        pila.axis = .vertical
        pila.alignment = .center
        pila.spacing = 22
        pila.translatesAutoresizingMaskIntoConstraints = false
        attesa.addSubview(pila)
        NSLayoutConstraint.activate([
            pila.centerXAnchor.constraint(equalTo: attesa.centerXAnchor),
            pila.centerYAnchor.constraint(equalTo: attesa.centerYAnchor),
            pila.leadingAnchor.constraint(greaterThanOrEqualTo: attesa.leadingAnchor, constant: 24),
            pila.trailingAnchor.constraint(lessThanOrEqualTo: attesa.trailingAnchor, constant: -24),
        ])
        view.addSubview(attesa)
    }

    @objc private func controllaPronto() {
        if let testo = try? String(contentsOf: Motore.pronto, encoding: .utf8) {
            let s = testo.trimmingCharacters(in: .whitespacesAndNewlines)
            if s.hasPrefix("http://127.0.0.1:"), let url = URL(string: s) {
                timer?.invalidate()
                timer = nil
                web.load(URLRequest(url: url))
                return
            }
        }
        let passati = Date().timeIntervalSince(inizio)
        if passati > 90 {
            timer?.invalidate()
            timer = nil
            scritta.text = "LIBRE VTT non è riuscito a partire. Chiudi l'app (scorri verso l'alto dalle app aperte) e riaprila."
        } else if passati > 15 {
            scritta.text = "Ci sta mettendo un po'. La prima apertura dopo l'installazione è la più lenta."
        }
    }

    private func nascondiAttesa() {
        guard !caricata else { return }
        caricata = true
        UIView.animate(withDuration: 0.22, animations: { self.attesa.alpha = 0 }, completion: { _ in self.attesa.isHidden = true })
    }

    /// Si torna nell'app: se nel frattempo iOS ha chiuso la pagina, la si riapre.
    func tornaInPrimoPiano() {
        guard caricata else { return }
        web.evaluateJavaScript("document.readyState") { [weak self] risultato, errore in
            if errore != nil || risultato == nil { self?.web.reload() }
        }
        inviaInfo()
    }

    // MARK: - com'è fatto il dispositivo

    static func info() -> [String: Any] {
        let pad = UIDevice.current.userInterfaceIdiom == .pad
        let mac = ProcessInfo.processInfo.isiOSAppOnMac     // l'app per iPad sui Mac con chip Apple
        let mouse = !GCMouse.mice().isEmpty
        let tastiera = GCKeyboard.coalesced != nil
        let versione = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
        return [
            "piattaforma": "ios",
            "dex": false,
            "desktop": mac,
            "tablet": pad || mac,
            "telefono": !(pad || mac),
            "mouse": mouse || mac,
            "tastiera": tastiera || mac,
            "versione": versione,
        ]
    }

    @objc private func cambiato() {
        inviaInfo()
    }

    private func inviaInfo() {
        guard caricata else { return }
        web.evaluateJavaScript("window.LIBRE_NATIVO&&LIBRE_NATIVO._info(" + ViewController.json(ViewController.info()) + ")", completionHandler: nil)
    }

    override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        super.viewWillTransition(to: size, with: coordinator)
        coordinator.animate(alongsideTransition: nil, completion: { [weak self] _ in self?.inviaInfo() })
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        inviaInfo()
    }

    // MARK: - indirizzi

    static func locale(_ u: URL) -> Bool {
        return u.scheme == "http" && (u.host == "127.0.0.1" || u.host == "localhost")
    }

    /// Un indirizzo che non è dell'app (un sito, una mail…) si apre con Safari o con l'app giusta.
    func apriFuori(_ u: URL) {
        guard let s = u.scheme?.lowercased(), ["http", "https", "mailto", "tel"].contains(s) else { return }
        UIApplication.shared.open(u, options: [:], completionHandler: nil)
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let u = navigationAction.request.url else { decisionHandler(.allow); return }
        let schema = u.scheme ?? ""
        if ViewController.locale(u) || ["about", "data", "blob"].contains(schema) {
            decisionHandler(.allow)
            return
        }
        // dentro un riquadro (per esempio il lettore di YouTube): va bene
        if let f = navigationAction.targetFrame, !f.isMainFrame {
            decisionHandler(.allow)
            return
        }
        decisionHandler(.cancel)
        apriFuori(u)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView === web, let u = webView.url, ViewController.locale(u) {
            nascondiAttesa()
            inviaInfo()
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // la pagina si è chiusa da sola (memoria finita): si ricomincia, Node è ancora lì
        webView.reload()
    }

    // MARK: - WKUIDelegate: finestre nuove e avvisi

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = navigationAction.request.url, !ViewController.locale(u), u.scheme != "about", !(u.absoluteString.isEmpty) {
            apriFuori(u)
            return nil
        }
        let figlia = WKWebView(frame: .zero, configuration: configuration)
        figlia.uiDelegate = self
        let finestra = FinestraWeb(web: figlia, padre: self)
        let nav = UINavigationController(rootViewController: finestra)
        nav.modalPresentationStyle = .pageSheet
        alto().present(nav, animated: true)
        return figlia
    }

    func webViewDidClose(_ webView: WKWebView) {
        if webView !== web, let p = presentedViewController {
            p.dismiss(animated: true)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        if !presenta(a) { completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Annulla", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        if !presenta(a) { completionHandler(false) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        a.addTextField { campo in campo.text = defaultText }
        a.addAction(UIAlertAction(title: "Annulla", style: .cancel) { _ in completionHandler(nil) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { [weak a] _ in completionHandler(a?.textFields?.first?.text ?? "") })
        if !presenta(a) { completionHandler(nil) }
    }

    /// Il controller più in alto (sopra a tutto quello che è già aperto).
    private func alto() -> UIViewController {
        var c: UIViewController = self
        while let p = c.presentedViewController, !p.isBeingDismissed { c = p }
        return c
    }

    private func presenta(_ c: UIViewController) -> Bool {
        let a = alto()
        guard a.viewIfLoaded?.window != nil else { return false }
        a.present(c, animated: true)
        return true
    }

    // MARK: - il ponte con la pagina (nativo.js)

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let s = message.body as? String, let d = s.data(using: .utf8),
              let m = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return }
        let id = (m["id"] as? NSNumber)?.intValue ?? -1
        switch m["cmd"] as? String ?? "" {
        case "importa":
            importa(id: id, cartella: (m["tipo"] as? String) == "cartella")
            return
        case "condividiFile":
            condividiFile(id: id, percorso: m["file"] as? String ?? "")
            return
        case "salvaFile":
            salvaFile(id: id, nome: m["nome"] as? String ?? "scheda.json", testo: m["testo"] as? String ?? "")
            return
        case "apriFile":
            apriFile(id: id)
            return
        case "scriviFile", "leggiFile":
            rispondi(id, ["errore": "Su iPhone e iPad la scheda non si può tenere sincronizzata con un file."])
            return
        case "condividiTesto":
            condividi([m["testo"] as? String ?? ""])
        case "vibra":
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case "schermoAcceso":
            UIApplication.shared.isIdleTimerDisabled = (m["si"] as? NSNumber)?.boolValue ?? false
        case "apriEsterno":
            if let u = URL(string: m["url"] as? String ?? "") { apriFuori(u) }
        default:
            NSLog("LIBRE VTT: comando sconosciuto \(m["cmd"] ?? "")")
        }
        rispondi(id, true)
    }

    private func rispondi(_ id: Int, _ dati: Any?) {
        guard id >= 0 else { return }
        let valore = dati.map { ViewController.json($0) } ?? "null"
        web.evaluateJavaScript("window.LIBRE_NATIVO&&LIBRE_NATIVO._risposta(\(id),\(valore))", completionHandler: nil)
    }

    /// Un valore in JSON (anche true/false/numeri, che JSONSerialization da soli non accetta).
    static func json(_ v: Any) -> String {
        guard let d = try? JSONSerialization.data(withJSONObject: [v], options: []),
              let s = String(data: d, encoding: .utf8), s.count >= 2 else { return "null" }
        return String(s.dropFirst().dropLast())
    }

    // MARK: - importare una campagna

    private func importa(id: Int, cartella: Bool) {
        if let vecchio = importaId { rispondi(vecchio, nil) }
        importaId = id
        importaCartella = cartella
        let picker: UIDocumentPickerViewController
        if cartella {
            picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
        } else {
            picker = UIDocumentPickerViewController(forOpeningContentTypes: [.zip], asCopy: true)
        }
        picker.delegate = self
        picker.allowsMultipleSelection = false
        scelta = .importa
        alto().present(picker, animated: true)
    }

    // MARK: - schede in un file

    private func salvaFile(id: Int, nome: String, testo: String) {
        let pulito = nome.replacingOccurrences(of: "/", with: "_")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(pulito.isEmpty ? "scheda.json" : pulito)
        do {
            try testo.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            rispondi(id, ["errore": "Non riesco a preparare il file: \(error.localizedDescription)"])
            return
        }
        let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
        picker.delegate = self
        scelta = .salva(id)
        alto().present(picker, animated: true)
    }

    private func apriFile(id: Int) {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.json, .plainText, .data], asCopy: true)
        picker.delegate = self
        picker.allowsMultipleSelection = false
        scelta = .apri(id)
        alto().present(picker, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        switch scelta {
        case .salva(let id):
            scelta = .importa
            rispondi(id, ["nome": urls.first?.lastPathComponent ?? ""])
            return
        case .apri(let id):
            scelta = .importa
            guard let u = urls.first else { rispondi(id, nil); return }
            let accesso = u.startAccessingSecurityScopedResource()
            defer { if accesso { u.stopAccessingSecurityScopedResource() } }
            if let testo = try? String(contentsOf: u, encoding: .utf8) {
                rispondi(id, ["testo": testo, "nome": u.lastPathComponent])
            } else {
                rispondi(id, ["errore": "Non riesco a leggere quel file."])
            }
            return
        case .importa:
            break
        }
        guard let id = importaId else { return }
        importaId = nil
        guard let u = urls.first else { rispondi(id, nil); return }
        let cartella = importaCartella
        let arrivi = Motore.utente.appendingPathComponent("importa", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        DispatchQueue.global(qos: .userInitiated).async {
            let accesso = u.startAccessingSecurityScopedResource()
            defer { if accesso { u.stopAccessingSecurityScopedResource() } }
            var risposta: [String: Any]
            do {
                let fm = FileManager.default
                try fm.createDirectory(at: arrivi, withIntermediateDirectories: true)
                var nome = u.lastPathComponent.replacingOccurrences(of: "/", with: "_")
                if nome.isEmpty { nome = cartella ? "Campagna" : "Campagna.zip" }
                if !cartella && !nome.lowercased().hasSuffix(".zip") { nome += ".zip" }
                let dest = arrivi.appendingPathComponent(nome, isDirectory: cartella)
                if cartella {
                    let c = NSFileCoordinator()
                    var erroreC: NSError?
                    var erroreCopia: Error?
                    c.coordinate(readingItemAt: u, options: [], error: &erroreC) { letto in
                        do { try fm.copyItem(at: letto, to: dest) } catch { erroreCopia = error }
                    }
                    if let e = erroreC ?? erroreCopia { throw e }
                } else {
                    do { try fm.moveItem(at: u, to: dest) } catch { try fm.copyItem(at: u, to: dest) }
                }
                risposta = ["sorgente": dest.path, "nome": nome]
            } catch {
                risposta = ["errore": "Non riesco a leggere quello che hai scelto: \(error.localizedDescription)"]
            }
            DispatchQueue.main.async { self.rispondi(id, risposta) }
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        switch scelta {
        case .salva(let id), .apri(let id):
            scelta = .importa
            rispondi(id, nil)
            return
        case .importa:
            break
        }
        if let id = importaId {
            importaId = nil
            rispondi(id, nil)
        }
    }

    // MARK: - condividere

    private func condividiFile(id: Int, percorso: String) {
        guard !percorso.isEmpty, FileManager.default.fileExists(atPath: percorso) else {
            rispondi(id, ["errore": "Il file non c'è."])
            return
        }
        condividi([URL(fileURLWithPath: percorso)])   // tra le scelte c'è anche «Salva su File»
        rispondi(id, true)
    }

    private func condividi(_ cose: [Any]) {
        let a = UIActivityViewController(activityItems: cose, applicationActivities: nil)
        if let p = a.popoverPresentationController {   // iPad: il riquadro deve partire da qualche parte
            p.sourceView = view
            p.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
            p.permittedArrowDirections = []
        }
        alto().present(a, animated: true)
    }
}

/// Una finestra aperta dalla pagina (per esempio il pannello della sessione).
final class FinestraWeb: UIViewController, WKNavigationDelegate {
    private let web: WKWebView
    private weak var padre: ViewController?

    init(web: WKWebView, padre: ViewController) {
        self.web = web
        self.padre = padre
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { return nil }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Colori.sfondo
        title = "LIBRE VTT"
        web.frame = view.bounds
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        web.navigationDelegate = self
        view.addSubview(web)
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(chiudi))
    }

    @objc private func chiudi() {
        dismiss(animated: true)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let u = navigationAction.request.url, !ViewController.locale(u),
              !["about", "data", "blob"].contains(u.scheme ?? "") else { decisionHandler(.allow); return }
        if let f = navigationAction.targetFrame, !f.isMainFrame { decisionHandler(.allow); return }
        decisionHandler(.cancel)
        padre?.apriFuori(u)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if let t = webView.title, !t.isEmpty { title = t }
    }
}

/// WKUserContentController tiene stretto chi riceve i messaggi: così il controller non resta in memoria per sempre.
final class PonteDebole: NSObject, WKScriptMessageHandler {
    private weak var bersaglio: WKScriptMessageHandler?
    init(_ b: WKScriptMessageHandler) { bersaglio = b }
    func userContentController(_ u: WKUserContentController, didReceive m: WKScriptMessage) {
        bersaglio?.userContentController(u, didReceive: m)
    }
}
