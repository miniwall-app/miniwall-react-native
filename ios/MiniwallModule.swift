import Foundation
import MiniwallSDK
import React

/// React Native module: forwards calls to `MiniwallBridge` and the screen's requests to JavaScript
/// (`MiniwallRequest` events, answered with `reply`).
@objc(MiniwallModule)
final class MiniwallModule: RCTEventEmitter {
    private var pending: [String: (Any?) -> Void] = [:]
    private var nextRequest = 0
    private var hasListeners = false
    private var auto: MiniwallBridge?

    private var observers: [NSObjectProtocol] = []

    /// RCTEventEmitter does not expose `invalidate()` to Swift, so listen for the notifications React Native posts when
    /// the bridge reloads or invalidates its modules (same moment `invalidate` runs).
    override init() {
        super.init()
        for name in ["RCTBridgeWillReloadNotification", "RCTBridgeWillInvalidateModulesNotification"] {
            observers.append(NotificationCenter.default.addObserver(forName: Notification.Name(name), object: nil, queue: .main) { [weak self] _ in
                self?.tearDown()
            })
        }
    }

    deinit {
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
    }

    override func supportedEvents() -> [String]! { ["MiniwallRequest"] }
    override func startObserving() { hasListeners = true }
    override func stopObserving() { hasListeners = false }
    override static func requiresMainQueueSetup() -> Bool { false }

    /// Requests the screen does not wait for: sent as events, never stored in `pending`.
    private static let fireAndForget: Set<String> = ["answer", "openUrl", "error", "autoResult"]

    private func makeBridge(presentationId: String) -> MiniwallBridge {
        MiniwallBridge { [weak self] method, arguments, reply in
            guard let self, self.hasListeners else { return reply(nil) }
            self.nextRequest += 1
            let requestId = String(self.nextRequest)
            if Self.fireAndForget.contains(method) {
                self.sendEvent(withName: "MiniwallRequest", body: ["requestId": requestId, "presentationId": presentationId, "method": method, "args": arguments])
                return reply(nil)
            }
            self.pending[requestId] = reply
            // The bridge gives up after 10 minutes; drop the entry then (a late JavaScript reply is ignored).
            DispatchQueue.main.asyncAfter(deadline: .now() + 610) { [weak self] in _ = self?.pending.removeValue(forKey: requestId) }
            self.sendEvent(withName: "MiniwallRequest", body: ["requestId": requestId, "presentationId": presentationId, "method": method, "args": arguments])
        }
    }

    @objc func configure(_ args: NSDictionary) {
        makeBridge(presentationId: "").configure(args as? [String: Any] ?? [:])
    }

    @objc func setAttributes(_ args: NSDictionary) {
        makeBridge(presentationId: "").setAttributes(args as? [String: Any] ?? [:])
    }

    @objc func present(_ args: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        let dict = args as? [String: Any] ?? [:]
        let bridge = makeBridge(presentationId: dict["presentationId"] as? String ?? "")
        DispatchQueue.main.async {
            bridge.present(dict) { result, error in
                if let error { reject("miniwall_error", error.localizedDescription, error) } else { resolve(result) }
                _ = bridge
            }
        }
    }

    @objc func preload(_ args: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        makeBridge(presentationId: "").preload(args as? [String: Any] ?? [:]) { resolve(nil) }
    }

    @objc func reportPurchase(_ args: NSDictionary) {
        makeBridge(presentationId: "").reportPurchase(args as? [String: Any] ?? [:])
    }

    @objc func reset(_ args: NSDictionary) {
        makeBridge(presentationId: "").reset(args as? [String: Any] ?? [:])
    }

    /// Placements that show by themselves; their requests come back with presentationId "auto".
    @objc func startAutoPlacements(_ args: NSDictionary) {
        let bridge = makeBridge(presentationId: "auto")
        auto = bridge
        bridge.startAutoPlacements(args as? [String: Any] ?? [:])
    }

    /// Stops the auto placements (JavaScript called `Miniwall.stopAutoPlacements()` or `dispose()`).
    @objc func stopAutoPlacements() {
        makeBridge(presentationId: "").stopAutoPlacements([:])
        auto = nil
    }

    /// The React Native bridge is going away (reload): nothing may wait for JavaScript any more. Main thread only.
    private func tearDown() {
        makeBridge(presentationId: "").stopAutoPlacements([:])
        auto = nil
        let replies = Array(pending.values)
        pending.removeAll()
        for reply in replies { reply(nil) }
    }

    @objc func track(_ args: NSDictionary) {
        makeBridge(presentationId: "").track(args as? [String: Any] ?? [:])
    }

    @objc func reply(_ requestId: String, value: Any?) {
        DispatchQueue.main.async {
            self.pending.removeValue(forKey: requestId)?(value is NSNull ? nil : value)
        }
    }
}
