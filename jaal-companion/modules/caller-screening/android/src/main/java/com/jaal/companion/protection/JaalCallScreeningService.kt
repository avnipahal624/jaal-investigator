package com.jaal.companion.protection

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telecom.CallScreeningService
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

/**
 * Android call screening (API 24+ service, role granted on API 29+).
 *
 * What this does:
 *  - Reads the number of an INCOMING call from the CallDetails handle.
 *  - Matches it against the locally cached JAAL watchlist (never the network —
 *    the OS may start this service with no app process resources).
 *  - On a match: warns the user with a local notification, and records the
 *    interaction ONLY if the user turned screening logs on.
 *  - Rejects the call ONLY when the user explicitly enabled auto-reject AND
 *    the indicator is investigator-verified.
 *
 * What this deliberately does NOT do:
 *  - It never treats an unknown number as suspicious.
 *  - It never reads, records or transmits call audio (no supported API does).
 *  - It never blocks a call without the user's explicit configuration.
 */
class JaalCallScreeningService : CallScreeningService() {

  override fun onScreenCall(callDetails: CallDetails) {
    val incoming = callDetails.callDirection == CallDetails.DIRECTION_INCOMING
    val handle = callDetails.handle
    val rawNumber = handle?.schemeSpecificPart ?: handle?.toString()

    // Outgoing calls and calls with no number are simply allowed through.
    if (!incoming || rawNumber.isNullOrEmpty()) {
      respondToCall(callDetails, allow())
      return
    }

    val normalized = IndicatorStore.normalizePhone(rawNumber)
    if (normalized == null) {
      respondToCall(callDetails, allow())
      return
    }

    val context = applicationContext
    val policy = IndicatorStore.loadPolicy(context)
    val match = IndicatorStore.match(context, normalized)

    if (match != null && policy.screeningLog) {
      IndicatorStore.recordScreened(
        context,
        JSONObject()
          .put("number", rawNumber)
          .put("normalized", normalized)
          .put("provenance", match.provenance)
          .put("reason", match.reason)
          .put("at", System.currentTimeMillis()),
      )
    }

    // Blocking requires BOTH an investigator-verified indicator AND the user
    // having explicitly opted into auto-reject.
    if (match != null && policy.autoRejectVerified && match.provenance == "VERIFIED") {
      respondToCall(callDetails, reject())
      return
    }

    if (match != null && policy.warnNotifications) {
      warn(context, rawNumber, match)
    }

    // The user always makes the final answer/reject decision.
    respondToCall(callDetails, allow())
  }

  private fun allow(): CallResponse = CallResponse.Builder().build()

  /**
   * Reject but DO skip neither the call log nor the notification, so the user
   * can see that a call was screened and act on it afterwards.
   */
  private fun reject(): CallResponse =
    CallResponse.Builder()
      .setRejectCall(true)
      .setSkipCallLog(false)
      .setSkipNotification(false)
      .build()

  private fun warn(context: Context, number: String, match: JaalIndicator) {
    try {
      if (
        Build.VERSION.SDK_INT >= 33 &&
        ContextCompat.checkSelfPermission(
          context,
          Manifest.permission.POST_NOTIFICATIONS,
        ) != PackageManager.PERMISSION_GRANTED
      ) {
        return
      }
      if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return

      val nm = context.getSystemService(NotificationManager::class.java) ?: return
      if (nm.getNotificationChannel(CHANNEL_ID) == null) {
        nm.createNotificationChannel(
          NotificationChannel(
            CHANNEL_ID,
            "JAAL caller warnings",
            NotificationManager.IMPORTANCE_HIGH,
          ),
        )
      }

      val verified = match.provenance == "VERIFIED"
      val title =
        if (verified) "JAAL: verified suspicious number"
        else "JAAL: number reported by users"
      val body =
        if (match.reason.isNotEmpty()) "${match.reason} — $number"
        else "$number"

      val notification =
        NotificationCompat.Builder(context, CHANNEL_ID)
          .setSmallIcon(android.R.drawable.ic_dialog_alert)
          .setContentTitle(title)
          .setContentText(body)
          .setStyle(NotificationCompat.BigTextStyle().bigText(body))
          .setPriority(NotificationCompat.PRIORITY_HIGH)
          .setCategory(NotificationCompat.CATEGORY_CALL)
          .setAutoCancel(true)
          .build()

      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    } catch (_: Exception) {
      // A failed warning never affects call handling.
    }
  }

  companion object {
    private const val CHANNEL_ID = "jaal_caller_warnings"
    private const val NOTIFICATION_ID = 7401
  }
}
