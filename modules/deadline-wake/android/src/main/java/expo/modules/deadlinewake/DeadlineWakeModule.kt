package expo.modules.deadlinewake

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.os.UserManager
import android.provider.Settings
import android.util.AtomicFile
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.File
import java.util.UUID

internal object DeadlineStore {
  const val ACTION = "expo.modules.deadlinewake.DEADLINE"
  @Volatile var listener: (() -> Unit)? = null
  private fun file(context: Context) = AtomicFile(File(context.noBackupFilesDir, "deadline-wake-v1.json"))
  private fun boot(context: Context) = Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, -1)
  private fun unlocked(context: Context) = context.getSystemService(UserManager::class.java).isUserUnlocked

  private fun read(context: Context): WakeState? {
    val raw = try { file(context).openRead().use { it.readBytes() } } catch (_: java.io.FileNotFoundException) { return null }
    return try {
      require(raw.size <= 4096)
      val json = JSONObject(String(raw, Charsets.UTF_8))
      require(json.getInt("schemaVersion") == 1)
      val scope = json.getString("scope")
      require(Regex("[a-f0-9]{16,64}").matches(scope))
      val entries = json.getJSONObject("deadlines")
      require(entries.length() <= DeadlinePolicy.slots.size)
      val deadlines = entries.keys().asSequence().associateWith { slot ->
        require(slot in DeadlinePolicy.slots)
        val d = entries.getJSONObject(slot)
        Deadline(d.getLong("identity"), d.getLong("wallAt"), d.getLong("elapsedAt"), d.getInt("boot"),
          d.getLong("createdWall"), d.getLong("lifetime")).also {
          require(it.identity > 0 && it.createdWall >= 0 && it.wallAt > 0 && it.elapsedAt > 0 && it.boot >= 0
            && it.lifetime in 1..DeadlinePolicy.MAX_LIFETIME && it.wallAt - it.createdWall <= it.lifetime)
        }
      }
      val retiredJson = json.optJSONObject("retired") ?: JSONObject()
      require(retiredJson.length() <= DeadlinePolicy.slots.size)
      val retired = retiredJson.keys().asSequence().associateWith { slot ->
        require(slot in DeadlinePolicy.slots && slot !in deadlines)
        retiredJson.getLong(slot).also { require(it > 0) }
      }
      fun nonce(key: String): String? = if (json.isNull(key)) null else json.getString(key).also { UUID.fromString(it) }
      WakeState(scope, deadlines, nonce("pending"), nonce("alarm"), retired)
    } catch (_: Exception) { file(context).delete(); null }
  }

  private fun save(context: Context, state: WakeState?) {
    if (state == null) { file(context).delete(); return }
    val entries = JSONObject()
    state.deadlines.forEach { (slot, d) -> entries.put(slot, JSONObject().put("identity", d.identity)
      .put("wallAt", d.wallAt).put("elapsedAt", d.elapsedAt).put("boot", d.boot)
      .put("createdWall", d.createdWall).put("lifetime", d.lifetime)) }
    val bytes = JSONObject().put("schemaVersion", 1).put("scope", state.scope).put("deadlines", entries)
      .put("retired", JSONObject(state.retired))
      .put("pending", state.pending ?: JSONObject.NULL).put("alarm", state.alarm ?: JSONObject.NULL).toString().toByteArray()
    val target = file(context)
    val stream = target.startWrite()
    try { stream.write(bytes); target.finishWrite(stream) } catch (error: Exception) { target.failWrite(stream); throw error }
  }

  private fun intent(context: Context, nonce: String?) = Intent(context, DeadlineWakeReceiver::class.java)
    .setAction(ACTION).putExtra("alarm", nonce)

  private fun schedule(context: Context, state: WakeState?) {
    val manager = context.getSystemService(AlarmManager::class.java)
    PendingIntent.getBroadcast(context, 0, intent(context, null), PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)?.let {
      manager.cancel(it); it.cancel()
    }
    val earliest = state?.deadlines?.values?.minOfOrNull { it.elapsedAt } ?: return
    val pending = checkNotNull(PendingIntent.getBroadcast(context, 0, intent(context, state.alarm), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    // Inexact wake: no exact-alarm permission, foreground service, credentials or background JS.
    manager.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, earliest, pending)
  }

  private fun rearm(context: Context, state: WakeState?, wake: Boolean): WakeState? {
    var next = state?.let { DeadlinePolicy.rearm(it, System.currentTimeMillis(), SystemClock.elapsedRealtime(), boot(context), wake, UUID.randomUUID().toString()) }
    save(context, next) // Persist the generation before registering its OS alarm.
    try { schedule(context, next) } catch (error: Exception) {
      next = next?.let { it.copy(pending = it.pending ?: UUID.randomUUID().toString()) }
      save(context, next)
      android.util.Log.w("DeadlineWake", "Alarm delivery unavailable; foreground reconciliation pending", error)
    }
    return next
  }

  @Synchronized fun put(context: Context, scope: String, slot: String, identity: Long, lifetime: Long) {
    check(unlocked(context))
    rearm(context, DeadlinePolicy.put(read(context), scope, slot, identity, lifetime,
      System.currentTimeMillis(), SystemClock.elapsedRealtime(), boot(context)), false)
  }
  @Synchronized fun cancel(context: Context, scope: String, slot: String) {
    rearm(context, DeadlinePolicy.cancel(read(context), scope, slot), false)
  }
  @Synchronized fun clear(context: Context) { save(context, null); schedule(context, null) }
  @Synchronized fun pending(context: Context): Map<String, String>? {
    if (!unlocked(context)) return null
    val state = rearm(context, read(context), false) ?: return null
    return state.pending?.let { mapOf("scope" to state.scope, "id" to it) }
  }
  @Synchronized fun acknowledge(context: Context, scope: String, id: String) {
    rearm(context, DeadlinePolicy.acknowledge(read(context), scope, id), false)
  }
  @Synchronized fun receive(context: Context, intent: Intent) {
    if (!unlocked(context)) return // Credential-protected metadata is read only after unlock.
    val state = read(context) ?: return
    if (intent.action == ACTION && (state.alarm == null || state.alarm != intent.getStringExtra("alarm"))) return
    val next = rearm(context, state, true)
    if (next?.pending != null) listener?.invoke()
  }
}

class DeadlineWakeReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action !in setOf(DeadlineStore.ACTION, Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_USER_UNLOCKED,
        Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_MY_PACKAGE_REPLACED)) return
    // Never start tracking, presence, network requests, services or command replay from a receiver.
    try { DeadlineStore.receive(context, intent) } catch (error: Exception) {
      android.util.Log.w("DeadlineWake", "Deadline re-arm unavailable", error)
    }
  }
}

class DeadlineWakeModule : Module() {
  private fun context() = appContext.reactContext ?: throw IllegalStateException("React context unavailable")
  override fun definition() = ModuleDefinition {
    Name("WindDeadlineWake")
    Events("onWake")
    AsyncFunction("put") { scope: String, slot: String, identity: Long, lifetime: Long -> DeadlineStore.put(context(), scope, slot, identity, lifetime) }
    AsyncFunction("cancel") { scope: String, slot: String -> DeadlineStore.cancel(context(), scope, slot) }
    AsyncFunction("clear") { DeadlineStore.clear(context()) }
    AsyncFunction("pending") { DeadlineStore.pending(context()) }
    AsyncFunction("acknowledge") { scope: String, id: String -> DeadlineStore.acknowledge(context(), scope, id) }
    OnStartObserving { DeadlineStore.listener = { sendEvent("onWake", emptyMap<String, Any>()) } }
    OnStopObserving { DeadlineStore.listener = null }
    OnDestroy { DeadlineStore.listener = null }
  }
}
