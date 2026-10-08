import React from "react";
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
import type { RootStack } from "./src/types";

const Stack = createNativeStackNavigator<RootStack>();

export default function App() {
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
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
