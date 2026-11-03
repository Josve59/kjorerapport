import StoreKit
import UIKit

/// Kjørerapport Pluss: ett engangskjøp i App Store (ikke abonnement) som låser opp kameraene, opplæringsplanen,
/// trafikklærersiden og rapportene for alle eldre turer. Kjøpet hører til Apple-ID-en, kan deles med familien
/// (Familiedeling), og gjenopprettes på en ny telefon. Selve turene er alltid gratis å ta opp, se og ta kopi av.
/// I Xcode prøves kjøpet uten penger med Pluss.storekit (valgt i skjemaet Kjorerapport).
@MainActor
final class PlusStore {
    static let productID = "net.svendsenmedia.kjorerapport.pluss"

    private(set) var product: Product?
    private(set) var owned = false
    /// Kalles når eierskapet endrer seg (kjøp på en annen enhet, refusjon, Familiedeling)
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
        if product == nil { product = try? await Product.products(for: [Self.productID]).first }
        await refreshOwned()
    }

    private func refreshOwned() async {
        var has = false
        for await result in Transaction.currentEntitlements {
            if case .verified(let t) = result, t.productID == Self.productID, t.revocationDate == nil { has = true }
        }
        if has != owned { owned = has; onChange?(has) }
    }

    var status: [String: Any] {
        ["owned": owned, "available": product != nil, "price": product?.displayPrice ?? NSNull()]
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
                return ["owned": owned]
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
