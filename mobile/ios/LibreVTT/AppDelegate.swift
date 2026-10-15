import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        Motore.avvia()
        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let c = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        c.delegateClass = SceneDelegate.self
        return c
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var tempoExtra: UIBackgroundTaskIdentifier = .invalid

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let ws = scene as? UIWindowScene else { return }
        let w = UIWindow(windowScene: ws)
        w.backgroundColor = Colori.sfondo
        w.rootViewController = ViewController()
        w.makeKeyAndVisible()
        window = w
    }

    /// Passando a un'altra app iOS ferma tutto dopo pochi secondi: chiediamo un po' di tempo in più,
    /// così una risposta veloce a un messaggio non fa cadere la partita.
    func sceneDidEnterBackground(_ scene: UIScene) {
        guard tempoExtra == .invalid else { return }
        tempoExtra = UIApplication.shared.beginBackgroundTask(withName: "partita") { [weak self] in
            self?.fineTempoExtra()
        }
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        fineTempoExtra()
        (window?.rootViewController as? ViewController)?.tornaInPrimoPiano()
    }

    private func fineTempoExtra() {
        if tempoExtra != .invalid {
            UIApplication.shared.endBackgroundTask(tempoExtra)
            tempoExtra = .invalid
        }
    }
}

/// Gli stessi colori della pagina: scuri se l'iPhone è in modalità scura, chiari altrimenti.
enum Colori {
    static let sfondo = UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0x12 / 255.0, green: 0x15 / 255.0, blue: 0x1C / 255.0, alpha: 1)
            : UIColor(red: 0xF3 / 255.0, green: 0xF5 / 255.0, blue: 0xF9 / 255.0, alpha: 1)
    }
}
