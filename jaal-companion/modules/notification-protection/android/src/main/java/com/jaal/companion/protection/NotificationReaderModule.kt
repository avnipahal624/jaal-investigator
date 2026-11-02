package com.jaal.companion.protection

import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Native bridge for optional message protection.
 *
 * The service itself cannot be started by the app — Android requires the user
 * to grant "Notification access" in system settings. This module only reports
 * that state, deep-links to the right settings page, stores the user's scope,
 * and reads back the local rule matches.
 */
class NotificationReaderModule : Module() {

  override fun definition() = ModuleDefinition {
    Name(MODULE_NAME)

    /** JSON: { available, granted, packageCount } */
    Function("getStatus") {
      val context = appContext.reactContext
      if (context == null) {
        return@Function """{"available":false,"granted":false,"packageCount":0}"""
      }

      var granted = false
      try {
        val flat = Settings.Secure.getString(
          context.contentResolver,
          "enabled_notification_listeners",
        ) ?: ""
        granted = flat.split(":").any { it.startsWith(context.packageName) }
      } catch (_: Exception) {
        granted = false
      }

      val policy = readPolicy(context)
      val count = policy?.second ?: 0
      return@Function """{"available":true,"granted":$granted,"packageCount":$count}"""
    }

    /** Open Android's notification-access settings page. */
    Function("openSettings") {
      val context = appContext.reactContext ?: return@Function false
      return@Function try {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        true
      } catch (_: Exception) {
        try {
          val fallback = Intent(Settings.ACTION_SETTINGS)
          fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(fallback)
          true
        } catch (_: Exception) {
          false
        }
      }
    }

    /** Store the user's chosen scope: { enabled, packages, maxChars }. */
    Function("setPolicy") { json: String ->
      val context = appContext.reactContext ?: return@Function false
      return@Function try {
        File(context.filesDir, MESSAGE_POLICY_FILE).writeText(json)
        true
      } catch (_: Exception) {
        false
      }
    }

    /** JSON array of local rule matches (empty when nothing matched). */
    Function("getHits") {
      val context = appContext.reactContext ?: return@Function "[]"
      try {
        val f = File(context.filesDir, MESSAGE_HITS_FILE)
        if (f.exists()) f.readText() else "[]"
      } catch (_: Exception) {
        "[]"
      }
    }

    Function("clearHits") {
      val context = appContext.reactContext ?: return@Function false
      try {
        File(context.filesDir, MESSAGE_HITS_FILE).delete()
        true
      } catch (_: Exception) {
        false
      }
    }
  }

  companion object {
    const val MODULE_NAME = "JaalNotificationReader"
    private const val MESSAGE_POLICY_FILE = "jaal_message_policy.json"
    private const val MESSAGE_HITS_FILE = "jaal_message_hits.json"

    private fun readPolicy(context: android.content.Context): Pair<String, Int>? =
      try {
        val f = File(context.filesDir, MESSAGE_POLICY_FILE)
        if (!f.exists()) return null
        val org = org.json.JSONObject(f.readText())
        val arr = org.optJSONArray("packages") ?: org.json.JSONArray()
        org.optString("enabled") to arr.length()
      } catch (_: Exception) {
        null
      }
  }
}
