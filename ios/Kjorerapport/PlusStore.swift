import CryptoKit
import StoreKit
import UIKit

/// Kjørerapport Pluss: ett engangskjøp i App Store (ikke abonnement) som låser opp kameraene, opplæringsplanen,
/// trafikklærersiden og rapportene for alle eldre turer. Kjøpet hører til Apple-ID-en, og gjenopprettes på en ny
/// telefon. 1.0.7: per person, uten Familiedeling. Selve turene er alltid gratis å ta opp, se og ta kopi av.
/// I Xcode prøves kjøpet uten penger med Pluss.storekit (valgt i skjemaet Kjorerapport).
/// 0.23.0: ingen prøveperiode lenger (eieren: mange kjøper en teoriapp 7–14 dager før prøven, og 14 gratis dager ville
/// gitt hele teorien gratis). Teorien er en del av Pluss, og 10 spørsmål er gratis i nettappen.
@MainActor
final class PlusStore {
    static let productID = "net.svendsenmedia.kjorerapport.pluss"

    private(set) var product: Product?
    private(set) var owned = false
    /// Anonymt kjøpsnummer (1.0.7): SHA-256 av Apples kjøps-ID, laget her på telefonen. Appen sender det til serveren
    /// for å telle hvor mange telefoner som bruker hvert kjøp. Selve kjøps-ID-en forlater aldri telefonen.
    private(set) var purchaseKey: String?
    /// Kalles når eierskapet endrer seg (kjøp på en annen enhet, refusjon)
    var onChange: ((Bool) -> Void)?
    private var updates: Task<Void, Never>?

    init() {
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                if case .verified(let t) = result { await t.finish() }
                await self?.refreshOwned()
            }
        }
        Task { await refresh() }
    }

    /// Henter produktet (pris) og sjekker om Pluss er kjøpt
    func refresh() async {
        if product == nil, let list = try? await Product.products(for: [Self.productID]) {
            product = list.first { $0.id == Self.productID }
        }
        await refreshOwned()
    }

    private func refreshOwned() async {
        var has = false, key: String?
        for await result in Transaction.currentEntitlements {
            guard case .verified(let t) = result, t.revocationDate == nil else { continue }
            if t.productID == Self.productID { has = true; key = Self.anonymous(t.originalID) }
        }
        let changed = has != owned
        owned = has
        purchaseKey = key
        if changed { onChange?(has) }
    }

    /// Samme kjøp gir samme nummer på alle telefoner, men nummeret kan ikke gjøres om til kjøps-ID-en igjen
    private static func anonymous(_ id: UInt64) -> String {
        let hash = SHA256.hash(data: Data("kjorerapport-pluss:\(id)".utf8))
        return String(hash.map { String(format: "%02x", $0) }.joined().prefix(32))
    }

    var status: [String: Any] {
        ["owned": owned, "available": product != nil, "price": product?.displayPrice ?? NSNull(), "kjop": purchaseKey ?? NSNull()]
    }

    /// Kjøpet. Svar: { owned, error }: error er «avbrutt», «venter» (godkjenning, f.eks. Spør før kjøp) eller en melding.
    func buy(in scene: UIWindowScene?) async -> [String: Any] {
        await refresh()
        guard let product else { return ["owned": owned, "error": "Fant ikke Pluss i App Store. Sjekk nettet og prøv igjen."] }
        guard let scene else { return ["owned": owned, "error": "Kjøpet kunne ikke vises."] }
        do {
            switch try await product.purchase(confirmIn: scene) {
            case .success(let verification):
                guard case .verified(let t) = verification else { return ["owned": owned, "error": "Apple kunne ikke bekrefte kjøpet."] }
                await t.finish()
                await refreshOwned()
                return status
            case .pending:
                return ["owned": owned, "error": "venter"]
            case .userCancelled:
                return ["owned": owned, "error": "avbrutt"]
            @unknown default:
                return ["owned": owned]
            }
        } catch {
            return ["owned": owned, "error": error.localizedDescription]
        }
    }

    /// «Gjenopprett kjøp» (Apple krever knappen): synkroniserer med App Store og sjekker på nytt
    func restore() async -> [String: Any] {
        do { try await AppStore.sync() } catch { return ["owned": owned, "error": error.localizedDescription] }
        await refreshOwned()
        return ["owned": owned]
    }

    /// Kode fra trafikkskolen (Apples tilbudskoder)
    func redeem(in scene: UIWindowScene?) async -> [String: Any] {
        guard let scene else { return ["owned": owned] }
        do { try await AppStore.presentOfferCodeRedeemSheet(in: scene) } catch { return ["owned": owned, "error": error.localizedDescription] }
        await refreshOwned()
        return ["owned": owned]
    }
}
