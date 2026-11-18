import UserNotifications

/// Påminnelse om dagens teori (0.24.0). Nettappen regner ut teksten for hver av de neste dagene (js/remind.js) og
/// sender listen hit; varslene legges inn lokalt på telefonen. Ingen server: alt skjer med iOS sine egne varsler.
/// Listen byttes ut hver gang appen åpnes, og dagens varsel faller bort når dagens mål er nådd.
enum Reminders {
    static let prefix = "kj-teori-"

    /// Spør om lov til varsler (bare første gang eleven slår påminnelsen på). Svar: { granted }
    static func authorize() async -> [String: Any] {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        return ["granted": granted]
    }

    /// Bytter ut alle påminnelsene med listen: [{ id, at (ISO-tid), title, body }]
    static func set(_ items: [[String: Any]]) async -> [String: Any] {
        let center = UNUserNotificationCenter.current()
        await clear()
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return ["scheduled": 0, "granted": false] }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        var n = 0
        for item in items.prefix(30) {
            guard let id = item["id"] as? String, let at = item["at"] as? String,
                  let date = iso.date(from: at) ?? plain.date(from: at), date > Date() else { continue }
            let content = UNMutableNotificationContent()
            content.title = item["title"] as? String ?? "Kjørerapport"
            content.body = item["body"] as? String ?? ""
            content.sound = .default
            let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
            let request = UNNotificationRequest(identifier: prefix + id, content: content,
                                                trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false))
            if (try? await center.add(request)) != nil { n += 1 }
        }
        return ["scheduled": n, "granted": true]
    }

    /// Fjerner alle påminnelsene om teori
    static func clear() async {
        let center = UNUserNotificationCenter.current()
        let ids = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(prefix) }
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }
}
