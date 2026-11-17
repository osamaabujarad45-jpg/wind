package expo.modules.deadlinewake

internal data class Deadline(
  val identity: Long, val wallAt: Long, val elapsedAt: Long,
  val boot: Int, val createdWall: Long, val lifetime: Long
)

internal data class WakeState(
  val scope: String, val deadlines: Map<String, Deadline> = emptyMap(),
  val pending: String? = null, val alarm: String? = null, val retired: Map<String, Long> = emptyMap()
)

/** A wake is only a request to reconcile; it carries no command or authority. */
internal object DeadlinePolicy {
  const val MAX_LIFETIME = 86_400_000L
  val slots = setOf("command", "summary", "diagnostics")

  fun remaining(d: Deadline, wall: Long, elapsed: Long, boot: Int): Long {
    if (wall < d.createdWall && boot != d.boot) return 0 // Clock continuity is unknown after reboot.
    val wallRemaining = (d.wallAt - wall).coerceIn(0, d.lifetime)
    return if (boot == d.boot) minOf(wallRemaining, (d.elapsedAt - elapsed).coerceAtLeast(0)) else wallRemaining
  }

  fun put(state: WakeState?, scope: String, slot: String, identity: Long, lifetime: Long,
          wall: Long, elapsed: Long, boot: Int): WakeState {
    require(Regex("[a-f0-9]{16,64}").matches(scope) && slot in slots)
    require(identity > 0 && lifetime in 1..MAX_LIFETIME && wall >= 0 && elapsed >= 0 && boot >= 0)
    val current = state?.takeIf { it.scope == scope } ?: WakeState(scope)
    if (current.deadlines[slot]?.identity == identity || current.retired[slot] == identity) return current // Never revive an expired identity.
    return current.copy(deadlines = current.deadlines + (slot to Deadline(identity, wall + lifetime, elapsed + lifetime, boot, wall, lifetime)), retired = current.retired - slot)
  }

  fun cancel(state: WakeState?, scope: String, slot: String): WakeState? {
    if (state == null || state.scope != scope) return state
    val next = state.copy(deadlines = state.deadlines - slot, retired = state.retired - slot)
    return next.takeIf { it.deadlines.isNotEmpty() || it.retired.isNotEmpty() }
  }

  fun rearm(state: WakeState, wall: Long, elapsed: Long, boot: Int, wake: Boolean, nonce: String): WakeState {
    var expired = false
    val retired = state.retired.toMutableMap()
    val valid = state.deadlines.mapNotNull { (slot, d) ->
      val left = remaining(d, wall, elapsed, boot)
      if (left == 0L) { expired = true; retired[slot] = d.identity; null }
      else slot to d.copy(wallAt = minOf(d.wallAt, wall + left), elapsedAt = elapsed + left, boot = boot)
    }.toMap()
    return state.copy(deadlines = valid, retired = retired,
      pending = state.pending ?: nonce.takeIf { (wake && state.deadlines.isNotEmpty()) || expired },
      alarm = nonce.takeIf { valid.isNotEmpty() })
  }

  fun acknowledge(state: WakeState?, scope: String, pending: String): WakeState? {
    if (state == null || state.scope != scope || state.pending != pending) return state
    return state.copy(pending = null).takeIf { it.deadlines.isNotEmpty() || it.retired.isNotEmpty() }
  }
}
