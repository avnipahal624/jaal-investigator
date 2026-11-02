import { Tabs } from "expo-router";
import { Text } from "react-native";
import { RequireAuth } from "../../src/components/auth-gate";
import { colors, fontSize } from "../../src/theme";

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>
  );
}

/**
 * The four consumer tabs. The whole group sits behind RequireAuth, so a
 * signed-out user can never reach the dashboard, activity, or profile.
 */
export default function TabsLayout() {
  return (
    <RequireAuth>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            backgroundColor: colors.white,
            borderTopColor: colors.border,
          },
          tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: "600" },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="activity"
          options={{
            title: "Activity",
            tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="protection"
          options={{
            title: "Protection",
            tabBarIcon: ({ focused }) => <TabIcon emoji="🛡️" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
          }}
        />
      </Tabs>
    </RequireAuth>
  );
}
