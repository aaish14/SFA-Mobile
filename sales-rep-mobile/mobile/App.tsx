import React, { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "./src/screens/HomeScreen";
import BeatsScreen from "./src/screens/BeatsScreen";
import StoresScreen from "./src/screens/StoresScreen";
import StoreGateScreen from "./src/screens/StoreGateScreen";
import VisitScreen from "./src/screens/VisitScreen";
import OrdersScreen from "./src/screens/OrdersScreen";
import ProductsScreen from "./src/screens/ProductsScreen";
import MoreScreen from "./src/screens/MoreScreen";
import OutletsScreen from "./src/screens/OutletsScreen";
import LoginScreen from "./src/screens/LoginScreen";
import OutletMapScreen from "./src/screens/OutletMapScreen";
import ModuleListScreen from "./src/screens/ModuleListScreen";
import ExpensesScreen from "./src/screens/ExpensesScreen";
import DayScreen from "./src/screens/DayScreen";
import SurveyScreen from "./src/screens/SurveyScreen";
import PrimaryScreen from "./src/screens/PrimaryScreen";
import type { RootStack } from "./src/types";
import { flushQueue } from "./src/storage/syncQueue";

const Stack = createNativeStackNavigator<RootStack>();

/**
 * Initialize the SFA navigation and session-aware application shell.
 */
export default function App() {
  useEffect(() => {
    void flushQueue();
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) void flushQueue();
    });
    return unsubscribe;
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Login">
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Main" component={HomeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Beats" component={BeatsScreen} options={{ title: "Today's Route" }} />
          <Stack.Screen name="Stores" component={StoresScreen} options={{ title: "My Outlets" }} />
          <Stack.Screen name="StoreGate" component={StoreGateScreen} options={{ title: "Outlet Details" }} />
          <Stack.Screen name="Visit" component={VisitScreen} options={{ title: "Outlet Visit" }} />
          <Stack.Screen name="Orders" component={OrdersScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Products" component={ProductsScreen} options={{ headerShown: false }} />
          <Stack.Screen name="More" component={MoreScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Outlets" component={OutletsScreen} options={{ headerShown: false }} />
          <Stack.Screen name="OutletMap" component={OutletMapScreen} options={{ title: "Outlet Map" }} />
          <Stack.Screen name="ModuleList" component={ModuleListScreen} options={({ route }) => ({ title: route.params.title })} />
          <Stack.Screen name="Expenses" component={ExpensesScreen} options={{ title: "Expenses" }} />
          <Stack.Screen name="Day" component={DayScreen} options={{ title: "Start / End Day" }} />
          <Stack.Screen name="Survey" component={SurveyScreen} options={{ title: "Outlet Survey" }} />
          <Stack.Screen name="Primary" component={PrimaryScreen} options={{ title: "Primary orders / returns" }} />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
