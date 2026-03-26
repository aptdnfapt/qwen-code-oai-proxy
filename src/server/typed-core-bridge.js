function loadTypedCore() {
  try {
    return require('../../dist/core/index.js');
  } catch {
    return null;
  }
}

function createTypedCoreServices(authManager) {
  const typedCore = loadTypedCore();
  if (!typedCore) {
    return {
      runtimeConfigStore: null,
      authService: null,
    };
  }

  const mode = process.env.NODE_ENV === 'development' ? 'development' : 'packaged';
  const runtimeConfigStore = new typedCore.RuntimeConfigStore({ mode });
  const authService = new typedCore.LegacyQwenAuthService(authManager);

  return {
    runtimeConfigStore,
    authService,
  };
}

module.exports = {
  createTypedCoreServices,
};
