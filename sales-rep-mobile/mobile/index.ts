import { registerRootComponent } from "expo";
import App from "./App";

// Resolve Expo through the workspace rather than a hard-coded node_modules path.
registerRootComponent(App);
