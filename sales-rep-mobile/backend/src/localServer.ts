import "./server.js";

// Some Windows launchers close an otherwise healthy child process after the
// parent batch file exits. Keeping this timer active makes the local API stay
// available until the user closes the SFA API command window.
setInterval(() => undefined, 2_147_483_647);
