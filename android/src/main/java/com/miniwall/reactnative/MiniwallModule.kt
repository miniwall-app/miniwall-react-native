package com.miniwall.reactnative

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.miniwall.sdk.MiniwallBridge
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/** React Native module: forwards calls to [MiniwallBridge] and the screen's requests to JavaScript. */
class MiniwallModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private val pending = ConcurrentHashMap<String, (Any?) -> Unit>()
    private val nextRequest = AtomicInteger()
    private var auto: MiniwallBridge? = null
    private val fireAndForget = setOf("answer", "openUrl", "error", "autoResult")
    private val mainHandler = Handler(Looper.getMainLooper())

    // React Native pauses JavaScript timers while its Activity is paused, and the Miniwall screen is another Activity on top
    // of it. A headless task keeps them running (see MiniwallKeepAlive in src/index.ts) for as long as a request waits for JS.
    private var waiting = 0
    private var keepAliveTask = -1

    override fun getName() = "MiniwallModule"

    private fun retainJs() = UiThreadUtil.runOnUiThread {
        if (waiting++ == 0 && context.hasActiveReactInstance()) {
            keepAliveTask = HeadlessJsTaskContext.getInstance(context)
                .startTask(HeadlessJsTaskConfig("MiniwallKeepAlive", Arguments.createMap(), 0, true))
        }
    }

    private fun releaseJs() = UiThreadUtil.runOnUiThread {
        if (waiting > 0 && --waiting == 0 && keepAliveTask >= 0) {
            HeadlessJsTaskContext.getInstance(context).finishTask(keepAliveTask)
            keepAliveTask = -1
        }
    }

    /** No JS to ask (no listener yet, or the context is gone): answer "no" at once, so the screen is not left busy. */
    private fun bridge(presentationId: String) = MiniwallBridge { method, arguments, reply ->
        if (!context.hasActiveReactInstance()) return@MiniwallBridge reply(null)
        val requestId = nextRequest.incrementAndGet().toString()
        if (method in fireAndForget) {
            // answer, openUrl, error, autoResult: nobody waits for JavaScript.
            emit(requestId, presentationId, method, arguments)
            return@MiniwallBridge reply(null)
        }
        retainJs()
        pending[requestId] = { value -> releaseJs(); reply(value) }
        // The bridge gives up after 10 minutes; drop the entry then (a late JavaScript reply is ignored).
        mainHandler.postDelayed({ if (pending.remove(requestId) != null) releaseJs() }, 610_000L)
        emit(requestId, presentationId, method, arguments)
    }

    private fun emit(requestId: String, presentationId: String, method: String, arguments: Map<String, Any?>) {
        val body = Arguments.makeNativeMap(mapOf("requestId" to requestId, "presentationId" to presentationId, "method" to method, "args" to arguments))
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("MiniwallRequest", body)
    }

    /** The React context is going away (reload): stop the auto placements and answer every waiting request with "no". */
    override fun invalidate() {
        super.invalidate()
        UiThreadUtil.runOnUiThread {
            try { MiniwallBridge { _, _, reply -> reply(null) }.stopAutoPlacements(emptyMap()) } catch (e: IllegalStateException) { /* never configured */ }
            auto = null
            val replies = pending.values.toList()
            pending.clear()
            replies.forEach { it(null) }
        }
    }

    /** `Miniwall.stopAutoPlacements()` / `dispose()` from JavaScript. */
    @ReactMethod
    fun stopAutoPlacements() {
        auto = null
        safely { bridge("").stopAutoPlacements(emptyMap()) }
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Double) {}

    /** The SDK throws when called before `configure`; a JavaScript call must not take the app down with it. */
    private fun safely(block: () -> Unit) {
        try { block() } catch (e: IllegalStateException) { android.util.Log.w("Miniwall", e.message ?: "call configure first") }
    }

    // The SDK's auto placements keep state that belongs to the main thread: run these there.
    @ReactMethod fun configure(args: ReadableMap) { val map = args.toHashMap(); UiThreadUtil.runOnUiThread { safely { bridge("").configure(context, map) } } }
    @ReactMethod fun setAttributes(args: ReadableMap) { val map = args.toHashMap(); UiThreadUtil.runOnUiThread { safely { bridge("").setAttributes(map) } } }
    @ReactMethod fun reportPurchase(args: ReadableMap) { val map = args.toHashMap(); UiThreadUtil.runOnUiThread { safely { bridge("").reportPurchase(map) } } }
    @ReactMethod fun reset(args: ReadableMap) { val map = args.toHashMap(); UiThreadUtil.runOnUiThread { safely { bridge("").reset(map) } } }
    @ReactMethod fun track(args: ReadableMap) { val map = args.toHashMap(); UiThreadUtil.runOnUiThread { safely { bridge("").track(map) } } }

    /** Placements that show by themselves; their requests come back with presentationId "auto". */
    @ReactMethod
    fun startAutoPlacements(args: ReadableMap) {
        val bridge = bridge("auto")
        auto = bridge
        val map = args.toHashMap()
        UiThreadUtil.runOnUiThread { safely { bridge.startAutoPlacements(map, reactApplicationContext.currentActivity) } }
    }

    @ReactMethod
    fun preload(args: ReadableMap, promise: Promise) {
        val map = args.toHashMap()
        UiThreadUtil.runOnUiThread {
            try { bridge("").preload(map) { promise.resolve(null) } } catch (e: IllegalStateException) { promise.reject("miniwall_error", e.message, e) }
        }
    }

    @ReactMethod
    fun present(args: ReadableMap, promise: Promise) {
        val activity = reactApplicationContext.currentActivity ?: return promise.reject("miniwall_error", "Miniwall: no current activity")
        val map = args.toHashMap()
        val bridge = bridge(map["presentationId"] as? String ?: "")
        UiThreadUtil.runOnUiThread {
            bridge.present(activity, map) { result, error ->
                if (error != null) promise.reject("miniwall_error", error.message, error) else promise.resolve(Arguments.makeNativeMap(result))
            }
        }
    }

    @ReactMethod
    fun reply(requestId: String, value: com.facebook.react.bridge.Dynamic?) {
        val v: Any? = when {
            value == null || value.isNull -> null
            value.type == com.facebook.react.bridge.ReadableType.Boolean -> value.asBoolean()
            value.type == com.facebook.react.bridge.ReadableType.Map -> value.asMap()?.toHashMap()
            else -> null
        }
        UiThreadUtil.runOnUiThread { pending.remove(requestId)?.invoke(v) }
    }
}
