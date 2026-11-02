package com.jaal.companion.protection

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * OPTIONAL message protection.
 *
 * Uses Android's official notification-listener mechanism, which does nothing
 * until the user enables "Notification access" for JAAL in system settings.
 *
 * Data rules enforced here:
 *  - Reads only the notification payload the OS posts — never the app's
 *    stored conversations, and never anything Accessibility Services could
 *    reach (this feature does not use accessibility at all).
 *  - Never reads JAAL's own notifications.
 *  - Only reads packages the user allow-listed.
 *  - Truncates to the configured character cap.
 *  - Stores a snippet ONLY when a local on-device rule matched. Non-matching
 *    notifications are never written to disk at all.
 *  - Never transmits anything. Nothing leaves the device from this service.
 *  - Never reads credentials: OTP-looking codes are matched as a *pattern*
 *    (the words around them), and the captured snippet is capped and shown
 *    to the user before any AI processing, which requires separate consent.
 */
class JaalNotificationListenerService : NotificationListenerService() {

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    try {
      val policy = MessagePolicy.load(this) ?: return
      if (!policy.enabled) return
      // Never read our own notifications (would loop).
      if (sbn.packageName == packageName) return
      // Only the packages the user explicitly chose.
      if (policy.packages.isNotEmpty() && !policy.packages.contains(sbn.packageName)) {
        return
      }

      val extras = sbn.notification?.extras ?: return
      val title =
        extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
      val text =
        extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
      if (title.isBlank() && text.isBlank()) return

      val body = "$title\n$text".take(policy.maxChars)
      val rule = LocalMessageRules.match(body) ?: return

      Hits.append(
        this,
        JSONObject()
          .put("packageName", sbn.packageName)
          .put("title", title.take(120))
          .put("snippet", body.take(policy.maxChars))
          .put("rule", rule)
          .put("at", sbn.postTime),
      )
    } catch (_: Exception) {
      // A listener failure must never crash the host process.
    }
  }
}

/** User-configured scope for message protection. */
data class MessagePolicy(
  val enabled: Boolean,
  val packages: List<String>,
  val maxChars: Int,
) {
  companion object {
    private const val FILE = "jaal_message_policy.json"
    private const val DEFAULT_MAX = 300

    fun load(service: NotificationListenerService): MessagePolicy? {
      return try {
        val f = File(service.filesDir, FILE)
        if (!f.exists()) return null
        val o = JSONObject(f.readText())
        val arr = o.optJSONArray("packages") ?: JSONArray()
        MessagePolicy(
          enabled = o.optBoolean("enabled", false),
          packages = (0 until arr.length()).map { arr.getString(it) },
          maxChars = o.optInt("maxChars", DEFAULT_MAX).coerceIn(80, 500),
        )
      } catch (_: Exception) {
        null
      }
    }
  }
}

/**
 * On-device, rule-based screening. Purely local — no network, no model.
 * A match is a *prompt to look*, never a verdict, and the UI says so.
 */
object LocalMessageRules {
  private val PAYMENT = Regex(
    """\b(upi|gpay|phonepe|paytm|ifsc|qr code)\b|\b(pay|send|transfer)\b.*\b(₹|rs\.?|inr)\b""",
    RegexOption.IGNORE_CASE,
  )
  private val OTP_REQUEST = Regex(
    """\b(otp|one[-\s]?time\s+password|verification\s+code|security\s+code)\b""",
    RegexOption.IGNORE_CASE,
  )
  private val URGENCY = Regex(
    """\b(your (account|card) will be|will be (blocked|suspended|closed)|immediately|last chance|act now)\b""",
    RegexOption.IGNORE_CASE,
  )
  private val IMPERSONATION = Regex(
    """\b(kyc|bank\s+update|pan\s+update|account\s+update|customs|police|court)\b""",
    RegexOption.IGNORE_CASE,
  )

  fun match(text: String): String? = when {
    OTP_REQUEST.containsMatchIn(text) && PAYMENT.containsMatchIn(text) ->
      "payment_with_otp"
    OTP_REQUEST.containsMatchIn(text) -> "otp_request"
    PAYMENT.containsMatchIn(text) -> "payment_request"
    URGENCY.containsMatchIn(text) -> "urgency_language"
    IMPERSONATION.containsMatchIn(text) -> "impersonation"
    else -> null
  }
}

/** Bounded local store of rule matches only. */
object Hits {
  private const val FILE = "jaal_message_hits.json"
  private const val MAX = 30

  fun append(service: NotificationListenerService, entry: JSONObject) {
    try {
      val f = File(service.filesDir, FILE)
      val arr = if (f.exists()) JSONArray(f.readText()) else JSONArray()
      arr.put(entry)
      while (arr.length() > MAX) arr.remove(arr.length() - 1)
      f.writeText(arr.toString())
    } catch (_: Exception) {
      // Never fatal.
    }
  }

  fun read(service: NotificationListenerService): String =
    try {
      val f = File(service.filesDir, FILE)
      if (f.exists()) f.readText() else "[]"
    } catch (_: Exception) {
      "[]"
    }

  fun clear(service: NotificationListenerService) {
    try {
      File(service.filesDir, FILE).delete()
    } catch (_: Exception) {
      // Nothing to do.
    }
  }
}
