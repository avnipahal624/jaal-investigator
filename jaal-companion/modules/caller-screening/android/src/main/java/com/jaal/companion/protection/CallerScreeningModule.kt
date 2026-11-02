package com.jaal.companion.protection

import android.app.role.RoleManager
import android.content.Intent
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Native bridge for Android caller protection.
 *
 * Every function returns a primitive or a JSON string so the JS side stays
 * decoupled from the module's type converters.
 */
class CallerScreeningModule : Module() {

  override fun definition() = ModuleDefinition {
    Name(MODULE_NAME)

    /**
     * Real state of the CALL_SCREENING role. Returns JSON:
     * { available, roleGranted, serviceEnabled, apiLevel, notificationsOn }
     */
    Function("getStatus") {
      val context = appContext.reactContext
      val api = Build.VERSION.SDK_INT
      if (context == null) {
        return@Function """{"available":false,"roleGranted":false,"serviceEnabled":false,"apiLevel":$api,"notificationsOn":false}"""
      }

      val supported = api >= 29
      var granted = false
      if (supported) {
        try {
          val rm = context.getSystemService(RoleManager::class.java)
          granted = rm != null && rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)
        } catch (_: Exception) {
          granted = false
        }
      }
      val notificationsOn =
        try {
          android.app.NotificationManagerCompat.from(context).areNotificationsEnabled()
        } catch (_: Exception) {
          false
        }

      return@Function """{"available":$supported,"roleGranted":$granted,"serviceEnabled":${granted && supported},"apiLevel":$api,"notificationsOn":$notificationsOn}"""
    }

    /**
     * Open Android's CALL_SCREENING role request UI. The user grants or
     * denies it there — we never grant it ourselves. The result is polled
     * from JS via getStatus when the app returns to the foreground.
     */
    AsyncFunction("requestRole") {
      if (Build.VERSION.SDK_INT < 29) return@AsyncFunction false
      val activity = appContext.currentActivity ?: return@AsyncFunction false
      return@AsyncFunction try {
        val rm = activity.getSystemService(RoleManager::class.java)
        if (rm == null) {
          false
        } else {
          activity.startActivityForResult(
            rm.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING),
            ROLE_REQUEST_CODE,
          )
          true
        }
      } catch (_: Exception) {
        false
      }
    }

    /** Push the JAAL watchlist (JSON array) to disk for the service. */
    Function("syncIndicators") { json: String ->
      val context = appContext.reactContext ?: return@Function false
      IndicatorStore.saveIndicators(context, json)
      true
    }

    /** Push the user's screening policy (JSON object) to disk. */
    Function("setPolicy") { json: String ->
      val context = appContext.reactContext ?: return@Function false
      IndicatorStore.savePolicy(context, json)
      true
    }

    /** JSON array of recent screened matches — only if logging is enabled. */
    Function("getScreenedLog") {
      val context = appContext.reactContext ?: return@Function "[]"
      IndicatorStore.loadScreened(context)
    }

    Function("clearScreenedLog") {
      val context = appContext.reactContext ?: return@Function false
      IndicatorStore.clearScreened(context)
      true
    }

    /** Fallback: open this app's system settings page. */
    Function("openSettings") {
      val context = appContext.reactContext ?: return@Function false
      return@Function try {
        val intent = Intent(
          Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
          android.net.Uri.fromParts("package", context.packageName, null),
        )
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        true
      } catch (_: Exception) {
        false
      }
    }
  }

  companion object {
    const val MODULE_NAME = "JaalCallerScreening"
    private const val ROLE_REQUEST_CODE = 4217
  }
}
