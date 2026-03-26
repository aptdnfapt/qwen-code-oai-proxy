function loadTypedCore(): any {
  try {
    return require("../core/index.js");
  } catch {
    return null;
  }
}

export function createTypedCoreServices(authManager: any): { runtimeConfigStore: any; authService: any } {
  const typedCore = loadTypedCore();
  if (!typedCore) {
    return {
      runtimeConfigStore: null,
      authService: null,
    };
  }

  const mode = process.env.NODE_ENV === "development" ? "development" : "packaged";
  const runtimeConfigStore = new typedCore.RuntimeConfigStore({ mode });
  const authService = new typedCore.LegacyQwenAuthService(authManager);

  return {
    runtimeConfigStore,
    authService,
  };
}
