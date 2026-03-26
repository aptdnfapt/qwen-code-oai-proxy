function createApiKeyMiddleware(config) {
  return (req, res, next) => {
    if (!config.apiKey) {
      return next();
    }

    const apiKey = req.headers['x-api-key'] || req.headers.authorization;

    let cleanApiKey = null;
    if (apiKey && typeof apiKey === 'string') {
      if (apiKey.startsWith('Bearer ')) {
        cleanApiKey = apiKey.substring(7).trim();
      } else {
        cleanApiKey = apiKey.trim();
      }
    }

    if (!cleanApiKey || !config.apiKey.includes(cleanApiKey)) {
      console.error('\x1b[31m%s\x1b[0m', 'Unauthorized request - Invalid or missing API key');
      return res.status(401).json({
        error: {
          message: 'Invalid or missing API key',
          type: 'authentication_error',
        },
      });
    }

    next();
  };
}

module.exports = {
  createApiKeyMiddleware,
};
