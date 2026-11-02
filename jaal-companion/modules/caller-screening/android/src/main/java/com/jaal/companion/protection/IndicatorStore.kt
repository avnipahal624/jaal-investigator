package com.jaal.companion.protection

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Local store backing the call-screening service.
 *
 * The service can be started by the OS with no JavaScript running, so the
 * watchlist and the user's policy must be readable from disk. JS writes both
 * files (from `protection:listIndicatorCache` and the Protection Centre
 * settings) — nothing here is fetched or generated on its own.
 *
 * Privacy: only normalised indicator values and short reasons are stored.
 * Reporter identities and report contents are never written to the device.
 */
data class JaalIndicator(
  val type: String,
  val value: String,
  val provenance: String,
  val reason: String,
  val updatedAt: Long,
)

/**
 * User-configured policy. `autoRejectVerified` defaults to FALSE: JAAL never
 * blocks a call unless the user explicitly turned that on, and even then only
 * for investigator-verified indicators.
 */
data class ScreeningPolicy(
  val autoRejectVerified: Boolean,
  val warnNotifications: Boolean,
  val screeningLog: Boolean,
)

object IndicatorStore {
  private const val INDICATORS_FILE = "jaal_indicators.json"
  private const val POLICY_FILE = "jaal_policy.json"
  private const val SCREENED_FILE = "jaal_screened.json"
  private const val MAX_SCREENED = 50

  /**
   * Must stay byte-for-byte equivalent to `normalizeIndicator("phone", …)`
   * in src/convex/protection.ts and `normalizePhone` in
   * jaal-companion/src/protection/threatIntel.ts, otherwise a number the
   * backend flags would never match on-device.
   */
  fun normalizePhone(raw: String): String? {
    var digits = raw.filter { it.isDigit() }
    if (digits.startsWith("00")) digits = digits.substring(2)
    if (digits.length == 12 && digits.startsWith("91")) digits = digits.substring(2)
    while (digits.startsWith("0") && digits.length > 10) {
      digits = digits.substring(1)
    }
    if (digits.length < 6 || digits.length > 15) return null
    return digits
  }

  private fun file(context: Context, name: String): File =
    File(context.filesDir, name)

  fun saveIndicators(context: Context, json: String) {
    try {
      file(context, INDICATORS_FILE).writeText(json)
    } catch (_: Exception) {
      // A failed write simply leaves the previous (or empty) watchlist in
      // place — screening degrades to "no match", never to a wrong match.
    }
  }

  fun loadIndicators(context: Context): List<JaalIndicator> {
    val f = file(context, INDICATORS_FILE)
    if (!f.exists()) return emptyList()
    return try {
      val arr = JSONArray(f.readText())
      (0 until arr.length()).mapNotNull { i ->
        val o = arr.optJSONObject(i) ?: return@mapNotNull null
        val type = o.optString("type")
        val value = o.optString("value")
        if (type != "phone" || value.isEmpty()) return@mapNotNull null
        JaalIndicator(
          type = type,
          value = value,
          provenance = o.optString("provenance"),
          reason = o.optString("reason"),
          updatedAt = o.optLong("updatedAt"),
        )
      }
    } catch (_: Exception) {
      emptyList()
    }
  }

  fun savePolicy(context: Context, json: String) {
    try {
      file(context, POLICY_FILE).writeText(json)
    } catch (_: Exception) {
      // Keep whatever policy was already stored.
    }
  }

  fun loadPolicy(context: Context): ScreeningPolicy {
    val f = file(context, POLICY_FILE)
    if (!f.exists()) return ScreeningPolicy(false, true, false)
    return try {
      val o = JSONObject(f.readText())
      ScreeningPolicy(
        autoRejectVerified = o.optBoolean("autoRejectVerified", false),
        warnNotifications = o.optBoolean("warnNotifications", true),
        screeningLog = o.optBoolean("screeningLog", false),
      )
    } catch (_: Exception) {
      ScreeningPolicy(false, true, false)
    }
  }

  fun match(context: Context, normalizedNumber: String): JaalIndicator? =
    loadIndicators(context).firstOrNull { it.value == normalizedNumber }

  fun recordScreened(context: Context, entry: JSONObject) {
    try {
      val f = file(context, SCREENED_FILE)
      val arr = if (f.exists()) JSONArray(f.readText()) else JSONArray()
      arr.put(entry)
      while (arr.length() > MAX_SCREENED) {
        arr.remove(arr.length() - 1)
      }
      f.writeText(arr.toString())
    } catch (_: Exception) {
      // Logging is a convenience; failure must never affect call handling.
    }
  }

  fun loadScreened(context: Context): String {
    val f = file(context, SCREENED_FILE)
    return if (f.exists()) f.readText() else "[]"
  }

  fun clearScreened(context: Context) {
    try {
      file(context, SCREENED_FILE).delete()
    } catch (_: Exception) {
      // Nothing to do.
    }
  }
}
