package expo.modules.deadlinewake

import org.junit.Assert.*
import org.junit.Test

class DeadlinePolicyTest {
  private val scope = "a".repeat(64)
  private fun state() = DeadlinePolicy.put(null, scope, "command", 10_000, 5_000, 5_000, 100, 1)

  @Test fun duplicateDoesNotExtendAndCancelFencesDelivery() {
    val saved = state()
    assertEquals(saved, DeadlinePolicy.put(saved, scope, "command", 10_000, 5_000, 6_000, 1_100, 1))
    assertNull(DeadlinePolicy.cancel(saved, scope, "command"))
    assertEquals(saved, DeadlinePolicy.cancel(saved, "b".repeat(64), "command"))
  }

  @Test fun logoutAndOtherSessionCannotInheritDeadlinesOrPending() {
    val pending = DeadlinePolicy.rearm(state(), 6_000, 1_100, 1, true, "wake")
    val other = DeadlinePolicy.put(pending, "b".repeat(64), "summary", 12_000, 1_000, 6_000, 1_100, 1)
    assertEquals(setOf("summary"), other.deadlines.keys)
    assertNull(other.pending)
    assertNull(DeadlinePolicy.acknowledge(pending, scope, "wake")?.pending)
    assertEquals(pending, DeadlinePolicy.acknowledge(pending, "b".repeat(64), "wake"))
    assertEquals(pending, DeadlinePolicy.acknowledge(pending, scope, "stale-wake"))
    // Clearing persistent state on logout means no deadline exists to restore.
    assertNull(DeadlinePolicy.cancel(null, scope, "command"))
  }

  @Test fun rebootRearmsOriginalWallDeadlineAndUnlockOrReplacementIsIdempotent() {
    val rebooted = DeadlinePolicy.rearm(state(), 7_000, 50, 2, true, "boot")
    assertEquals(10_000L, rebooted.deadlines.getValue("command").wallAt)
    assertEquals(3_050L, rebooted.deadlines.getValue("command").elapsedAt)
    assertEquals("boot", rebooted.pending)
    val duplicate = DeadlinePolicy.rearm(rebooted, 7_000, 50, 2, true, "unlock-or-package")
    assertEquals(rebooted.deadlines, duplicate.deadlines)
    assertEquals("boot", duplicate.pending)
  }

  @Test fun clockChangesCannotExtendOrReviveExpiredDeadline() {
    val backwards = DeadlinePolicy.rearm(state(), 1_000, 2_100, 1, true, "clock")
    assertEquals(3_000L, backwards.deadlines.getValue("command").elapsedAt - 2_100)
    val forwards = DeadlinePolicy.rearm(state(), 11_000, 1_100, 1, true, "clock")
    assertTrue(forwards.deadlines.isEmpty())
    assertEquals("clock", forwards.pending)
    val unknownClockAfterReboot = DeadlinePolicy.rearm(state(), 1_000, 50, 2, true, "boot")
    assertTrue(unknownClockAfterReboot.deadlines.isEmpty())
    assertEquals("boot", unknownClockAfterReboot.pending)
    val expired = DeadlinePolicy.rearm(state(), 10_000, 5_100, 1, false, "due")
    assertTrue(expired.deadlines.isEmpty())
    assertNull(expired.alarm)
    val acknowledged = DeadlinePolicy.acknowledge(expired, scope, "due")!!
    assertNull(acknowledged.pending)
    val reopenedAfterClockRewind = DeadlinePolicy.put(acknowledged, scope, "command", 10_000, 5_000, 5_000, 5_200, 1)
    assertTrue(reopenedAfterClockRewind.deadlines.isEmpty())
    assertEquals(10_000L, reopenedAfterClockRewind.retired["command"])
    assertNull(DeadlinePolicy.cancel(reopenedAfterClockRewind, scope, "command"))
  }

  @Test fun earliestOfExistingDeadlinesAndBounds() {
    val two = DeadlinePolicy.put(state(), scope, "summary", 8_000, 3_000, 5_000, 100, 1)
    val armed = DeadlinePolicy.rearm(two, 6_000, 1_100, 1, false, "alarm")
    assertEquals(3_100L, armed.deadlines.values.minOf { it.elapsedAt })
    assertNull(armed.pending)
    assertThrows(IllegalArgumentException::class.java) { DeadlinePolicy.put(null, scope, "location", 1, 1, 0, 0, 1) }
    assertThrows(IllegalArgumentException::class.java) { DeadlinePolicy.put(null, scope, "command", 1, DeadlinePolicy.MAX_LIFETIME + 1, 0, 0, 1) }
  }
}
