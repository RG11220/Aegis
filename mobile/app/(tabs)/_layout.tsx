import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";

const TabsLayout = () => {


  const {isSignedIn, isLoaded} = useAuth();
  if(!isLoaded) return null;
  if(!isSignedIn) return <Redirect href="/(auth)" />
 

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: {
        backgroundColor: "#0D0D0D",
        borderTopColor: "#1a1a1a",
        borderWidth: 1,
        height: 88,
      },
      tabBarActiveTintColor: "#00876F",
      tabBarInactiveTintColor: "#6B6B70",
      tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
    }}
      
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chats",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons
              name={focused ? "chatbubbles" : "chatbubbles-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "settings" : "settings-outline"} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
};

export default TabsLayout;
